import openai
import configparser

## load config
config = configparser.ConfigParser()
config.read('config.ini')
api_key = config.get('openai', 'api_key')

# Initialize the OpenAI client (New API usage)
client = openai.OpenAI(api_key=api_key)

# Define the prompt
prompt = "Explain how neural networks work in simple terms."

# Make a request using the correct API method
response = client.chat.completions.create(
    model="gpt-4o-2024-08-06",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": prompt},
    ],
    temperature=0.7,
    max_tokens=100,
    stream=True
)

# Print the response
for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)


"""
FOR STORING CHAT SESSIONS

import openai

client = openai.OpenAI(api_key="your-api-key")

# Store the conversation history
chat_history = [
    {"role": "system", "content": "You are a helpful assistant."}
]

while True:
    user_input = input("You: ")
    if user_input.lower() in ["exit", "quit"]:
        break

    # Append user message
    chat_history.append({"role": "user", "content": user_input})

    # Send request with full chat history
    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=chat_history,
        temperature=0.7
    )

    # Get the response
    bot_reply = response.choices[0].message.content
    print("ChatGPT:", bot_reply)

    # Append assistant response
    chat_history.append({"role": "assistant", "content": bot_reply})
"""