import json
import os
import re
from typing import Dict, List, Any
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
load_dotenv()

# Set up OpenAI client
import configparser
config = configparser.ConfigParser()
config.read('config.ini')
api_key = config.get('openai', 'api_key')
client = OpenAI(api_key=api_key)

def filter_har_entries(entries: List[Dict]) -> List[Dict]:
    """Filter HAR entries to keep only API calls and remove HTML, CSS, etc."""
    api_entries = []
    
    for entry in entries:
        # Skip entries that don't have response
        if "response" not in entry or "content" not in entry["response"]:
            continue
            
        # Skip entries that return HTML
        content_type = entry["response"].get("content", {}).get("mimeType", "")
        if "html" in content_type.lower():
            continue
            
        # Skip image, font, stylesheet requests
        if any(x in content_type.lower() for x in ["image", "font", "css"]):
            continue
            
        # Keep entries that are likely APIs
        if (
            "json" in content_type.lower() or 
            "xml" in content_type.lower() or 
            "javascript" in content_type.lower() or 
            "api" in entry["request"]["url"].lower()
        ):
            api_entries.append(entry)
    
    return api_entries


def extract_key_request_info(entry: Dict) -> Dict:
    """Extract key information from a HAR request entry to reduce token usage."""
    request = entry["request"]
    response = entry["response"]
    
    # Extract headers (keeping only important ones)
    important_headers = [
        "authorization", "content-type", "accept", "origin", "referer", 
        "x-api-key", "user-agent", "cookie"
    ]
    
    headers = {}
    for header in request["headers"]:
        if header["name"].lower() in important_headers:
            headers[header["name"]] = header["value"]
    
    # Extract request data
    method = request["method"]
    url = request["url"]
    
    # Handle different request body formats
    post_data = None
    if "postData" in request:
        if "text" in request["postData"]:
            post_data = request["postData"]["text"]
        elif "params" in request["postData"]:
            post_data = {p["name"]: p["value"] for p in request["postData"]["params"]}
    
    # Extract basic response info
    status = response["status"]
    content_type = response.get("content", {}).get("mimeType", "")
    
    return {
        "method": method,
        "url": url,
        "headers": headers,
        "postData": post_data,
        "responseStatus": status,
        "responseType": content_type
    }


def generate_curl_command(entry: Dict) -> str:
    """Generate a curl command from the full HAR entry."""
    request = entry["request"]
    method = request["method"]
    url = request["url"]
    
    curl_parts = [f"curl -X {method} '{url}'"]
    
    # Add headers
    for header in request["headers"]:
        name = header["name"]
        value = header["value"].replace("'", "'\\''")  # Escape single quotes
        curl_parts.append(f"-H '{name}: {value}'")
    
    # Add data if present
    if "postData" in request:
        if "text" in request["postData"]:
            data = request["postData"]["text"].replace("'", "'\\''")
            curl_parts.append(f"-d '{data}'")
        elif "params" in request["postData"]:
            for param in request["postData"]["params"]:
                name = param["name"]
                value = param["value"].replace("'", "'\\''")
                curl_parts.append(f"-F '{name}={value}'")
    
    return " \\\n  ".join(curl_parts)


def analyze_with_llm(api_entries: List[Dict], description: str) -> Dict:
    """Use OpenAI to select the most relevant API request from all entries."""
    # Create simplified entries for use in the LLM prompt to reduce token usage
    simplified_entries = []
    for i, entry in enumerate(api_entries):
        simplified = {
            "index": i,
            "method": entry["request"]["method"],
            "url": entry["request"]["url"],
            "contentType": next((h["value"] for h in entry["request"]["headers"] 
                             if h["name"].lower() == "content-type"), "None")
        }
        simplified_entries.append(simplified)
    
    # Prepare the prompt with all entries in simplified form
    prompt = f"""
You are an expert at analyzing API requests. I need you to find the most relevant API request from a HAR file based on this description:

"{description}"

Here are all the API requests found in the HAR file (simplified to save tokens):
{json.dumps(simplified_entries, indent=2)}

Please identify the SINGLE most relevant request that best matches the description. 
Return ONLY a JSON object with the following structure:
{{
  "selected_index": [index of the selected request in the provided array],
  "reasoning": "Brief explanation of why this request matches the description"
}}
"""

    try:
        # Use the new OpenAI client API format
        response = client.chat.completions.create(
            model="gpt-4o-2024-08-06",  # Use the model specified in requirements
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=500
        )
        
        # Extract and parse the response
        result_text = response.choices[0].message.content
        print("\nLLM Response:")
        print(result_text)
        
        # Use regex to extract JSON object from the response
        json_match = re.search(r'\{[\s\S]*\}', result_text)
        if json_match:
            result = json.loads(json_match.group(0))
            selected_index = result.get("selected_index")
            
            if selected_index is not None and 0 <= selected_index < len(api_entries):
                # Return the full entry from the original list
                return api_entries[selected_index]
            else:
                # Fallback to first entry if index is invalid
                print(f"Warning: Selected index {selected_index} is invalid. Using first entry instead.")
                return api_entries[0]
        else:
            # Fallback to first entry if no valid JSON
            print("Warning: Could not parse LLM response as JSON. Using first entry instead.")
            return api_entries[0]
            
    except Exception as e:
        print(f"Error using OpenAI API: {e}")
        # Fallback to first entry in case of API error
        return api_entries[0] if api_entries else {}


def main():
    # Configuration
    har_file_path = "har_files/www.saucedemo.com.har"  # Update with your file path
    description = "Generate a curl command for getting all accepted usernames for swag-labs."
    
    print(f"Testing with HAR file: {har_file_path}")
    print(f"Description: {description}")
    
    try:
        # Read the HAR file
        with open(har_file_path, 'r') as file:
            har_data = json.load(file)
        
        # Extract entries
        if "log" not in har_data or "entries" not in har_data["log"]:
            print("Error: Invalid HAR file format")
            return
        
        entries = har_data["log"]["entries"]
        print(f"Total entries found: {len(entries)}")
        
        # Filter to keep only API requests
        api_entries = filter_har_entries(entries)
        print(f"API entries found: {len(api_entries)}")
        
        if not api_entries:
            print("No API requests found in the HAR file")
            return
        
        # Print brief info about found APIs
        print("\nAPI requests found:")
        for i, entry in enumerate(api_entries[:10]):  # Show first 10 only
            req = entry["request"]
            print(f"{i}. {req['method']} {req['url'][:100]}...")
        if len(api_entries) > 10:
            print(f"...and {len(api_entries) - 10} more")
        
        # Use LLM to find the most relevant request from all entries
        print("\nAnalyzing with LLM...")
        selected_entry = analyze_with_llm(api_entries, description)
        
        # Generate curl command from the full entry
        curl_command = generate_curl_command(selected_entry)
        
        # Print results
        print("\n=== Results ===")
        print(f"Selected API: {selected_entry['request']['method']} {selected_entry['request']['url']}")
        
        content_type = "Not specified"
        for header in selected_entry["response"]["headers"]:
            if header["name"].lower() == "content-type":
                content_type = header["value"]
                break
                
        print(f"Response Status: {selected_entry['response']['status']}")
        print(f"Content Type: {content_type}")
        
        print("\nGenerated curl command:")
        print(curl_command)
        
        # Optionally save the curl command to a file
        with open("curl_command.txt", "w") as f:
            f.write(curl_command)
        print("\nThe curl command has been saved to curl_command.txt")
        
    except FileNotFoundError:
        print(f"Error: File not found at {har_file_path}")
    except json.JSONDecodeError:
        print("Error: Invalid JSON in HAR file")
    except Exception as e:
        print(f"Error: {str(e)}")


if __name__ == "__main__":
    main()