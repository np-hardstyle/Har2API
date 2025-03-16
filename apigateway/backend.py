import json
import re
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from openai import OpenAI
import os
from pathlib import Path
import shutil
import httpx

# Load environment variables
import configparser
config = configparser.ConfigParser()
config.read('config.ini')
api_key = config.get('openai', 'api_key')
client = OpenAI(api_key=api_key)

TEMP_DIR = Path("./temp_uploads")
TEMP_DIR.mkdir(exist_ok=True)
upload_tracking: Dict[str, Dict[str, Any]] = {}
app = FastAPI()

# Add CORS middleware to allow requests from your Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Update with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class APIResponse(BaseModel):
    curlCommand: str
    requestDetails: Optional[Dict[str, Any]] = None
    
class FinalizeRequest(BaseModel):
    fileId: str
    description: str
    
class FinalizeUpload(BaseModel):
    fileId: str
    filename: str


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


async def analyze_with_llm(api_entries: List[Dict], description: str, selectedModel: str) -> Dict:
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
        if selectedModel == "gpt-4o-2024-08-06":
            response = client.chat.completions.create(
            model=selectedModel,
            messages=[
                {"role": "user", "content": prompt},
            ],
            temperature=0.7
        )


        else:
            response = client.chat.completions.create(
                model=selectedModel,
                messages=[{"role": "user", "content": prompt}],
            )
        
        result_text = response.choices[0].message.content
        
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
                return api_entries[0]
        else:
            # Fallback to first entry if no valid JSON
            return api_entries[0]
            
    except Exception as e:
        print(f"Error using OpenAI API: {e}")
        # Fallback to first entry in case of API error
        return api_entries[0] if api_entries else {}


@app.post("/proxy")
async def proxy(request: Request) -> Response:
    # Get the request body
    request_body = await request.body()
    request_data = {}
    
    try:
        # Parse the request data
        req_dict = json.loads(request_body)
        url = req_dict.get("url")
        method = req_dict.get("method", "GET")
        headers = req_dict.get("headers", {})
        body = req_dict.get("body")
        
        # Store request information
        request_data = {
            "url": url,
            "method": method,
            "headers": headers,
            "body": body
        }
        
        
        # Make the actual HTTP request
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                content=body
            )
        
        # Parse the response body
        response_body = response.text
        response_json = None
        try:
            response_json = response.json()
        except:
            pass
        
        # Create the response data
        response_data = {
            "success": True,
            "server_response": {
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "body": response_json if response_json else response_body
            },
            "request_info": request_data
        }
        
        # Return response with server's status code
        return JSONResponse(
            content=response_data,
            headers={"Content-Type": "application/json"}
        )
        
    except Exception as e:
        # Handle any errors
        error_data = {
            "success": False,
            "error": str(e),
            "request_info": request_data
        }
        return JSONResponse(
            content=error_data,
            status_code=500,
            headers={"Content-Type": "application/json"}
        )

@app.post("/api/upload-chunked")
async def upload_chunked(chunk: UploadFile = File(...), index: str = Form(...), totalChunks: str = Form(...), fileId: str = Form(...), filename: str = Form(...)):
    """Handle a single chunk of a file upload."""
    try:
        chunk_index = int(index)
        total_chunks = int(totalChunks)
        
        # Create directory for this upload if it doesn't exist
        upload_dir = TEMP_DIR / fileId
        upload_dir.mkdir(exist_ok=True)
        
        # Save the chunk
        chunk_path = upload_dir / f"chunk_{chunk_index}"
        with open(chunk_path, "wb") as f:
            # Read and write in small chunks to avoid loading entire file in memory
            chunk_data = await chunk.read(1024 * 1024)  # Read 1MB at a time
            while chunk_data:
                f.write(chunk_data)
                chunk_data = await chunk.read(1024 * 1024)
        
        # Track upload progress
        if fileId not in upload_tracking:
            upload_tracking[fileId] = {
                "filename": filename,
                "totalChunks": total_chunks,
                "receivedChunks": set(),
                "completed": False
            }
        
        upload_tracking[fileId]["receivedChunks"].add(chunk_index)
        
        # Return success
        return {"success": True, "chunkIndex": chunk_index}
    
    except Exception as e:
        print(f"Error processing chunk: {e}")
        return {"success": False, "error": str(e)}

@app.post("/api/finalize-upload")
async def finalize_upload(request: FinalizeUpload):
    """Reassemble the chunks and process the complete file."""
    fileId = request.fileId
    description = request.filename
    
    # Check if upload exists
    if fileId not in upload_tracking:
        raise HTTPException(status_code=404, detail="Upload not found")
    
    upload_info = upload_tracking[fileId]
    
    # Check if all chunks were received
    if len(upload_info["receivedChunks"]) != upload_info["totalChunks"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Upload incomplete. Received {len(upload_info['receivedChunks'])} of {upload_info['totalChunks']} chunks"
        )
    
    try:
        # Assemble the complete file
        upload_dir = TEMP_DIR / fileId
        output_file = TEMP_DIR / f"{fileId}_{upload_info['filename']}"
        
        with open(output_file, "wb") as outfile:
            for i in range(upload_info["totalChunks"]):
                chunk_path = upload_dir / f"chunk_{i}"
                with open(chunk_path, "rb") as infile:
                    # Copy in chunks to avoid memory issues
                    shutil.copyfileobj(infile, outfile, 1024 * 1024)
        
        # Process the file (using your existing function)
        file_size = output_file.stat().st_size
        
        # Update tracking info
        upload_tracking[fileId]["completed"] = True
        upload_tracking[fileId]["outputPath"] = str(output_file)
        upload_tracking[fileId]["description"] = description
        upload_tracking[fileId]["size"] = file_size
        
        return  {
            "fileId": fileId,
            "filename": upload_info["filename"],
            "size": file_size,
            "description": description,
            "chunks": upload_info["totalChunks"],
            "status": "complete"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")
    
    finally:
        # Clean up temporary files
        shutil.rmtree(upload_dir)

@app.get("/api/extract-api/", response_model=APIResponse)
async def extract_api(fileId: str, description: str, selectedModel: str = 'o3-mini-2025-01-31'):
    """Process HAR file and extract the most relevant API request based on description."""
    
    try:
        # Read and parse the HAR file from filId
        with open(upload_tracking[fileId]["outputPath"], 'r') as file:
            har_data = json.load(file)
        
        # Extract entries
        if "log" not in har_data or "entries" not in har_data["log"]:
            raise HTTPException(status_code=400, detail="Invalid HAR file format")
        
        entries = har_data["log"]["entries"]
        
        # Filter to keep only API requests
        api_entries = filter_har_entries(entries)
        
        if not api_entries:
            raise HTTPException(status_code=404, detail="No API requests found in the HAR file")
        
        # Use LLM to find the most relevant request
        selected_entry = await analyze_with_llm(api_entries, description, selectedModel)
        
        # Generate curl command from the full entry
        curl_command = generate_curl_command(selected_entry)
        
        # Extract request details
        content_type = "Not specified"
        for header in selected_entry["response"]["headers"]:
            if header["name"].lower() == "content-type":
                content_type = header["value"]
                break
        
        return APIResponse(
            curlCommand=curl_command,
            requestDetails={
                "method": selected_entry["request"]["method"],
                "url": selected_entry["request"]["url"],
                "contentType": content_type,
                "responseStatus": selected_entry["response"]["status"],
                "responseSize": selected_entry["response"].get("content", {}).get("size", 0)
            }
        )
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid HAR file format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")

def main():
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

if __name__ == "__main__":
    main()