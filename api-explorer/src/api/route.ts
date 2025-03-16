// app/api/extract-api/route.ts
import { NextRequest } from 'next/server';
import { resourceLimits } from 'worker_threads';

export const config = {
  api: {
    bodyParser: false, // Disable the built-in parser
  },
};

// export async function POST(file: File, description: string): Promise<any>{
//   const formData = new FormData();
//   formData.append('file', file);
//   formData.append('description', description);

//   try {
//     const response = await fetch(`${process.env.BACKEND_URL}/api/extract-api`, {
//       method: 'POST',
//       body: formData,
//     });

//     if (!response.ok) {
//       throw new Error(`Error: ${response.status}`);
//     }

//     const data = await response.json();
//     return data;
//   } catch (error) {
//     console.error(error);
//     return new Response(JSON.stringify({ error: 'An error occurred' }), {
//       status: 500,
//     })
//   }
//}


/**
 * Uploads a large file by splitting it into chunks to match the FastAPI endpoint
 * @param file - File object to upload
 * @param chunkSize - Size of each chunk in bytes (default: 750KB)
 * @returns Promise with the combined response data
 */
export async function uploadLargeFile(
  file: File, 
  chunkSize: number = 750 * 1024
): Promise<any> {
  // Generate a unique ID for this upload session
  const fileId = `upload_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  const totalChunks = Math.ceil(file.size / chunkSize);
  const uploadedChunks = new Set<number>();

  try {
    // Process file in chunks
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);
      
      // Create FormData object matching the FastAPI endpoint parameters
      const formData = new FormData();
      formData.append('chunk', new File([chunk], file.name));
      formData.append('index', chunkIndex.toString());
      formData.append('totalChunks', totalChunks.toString());
      formData.append('fileId', fileId);
      formData.append('filename', file.name);
      
      // Send this chunk to your FastAPI endpoint
      const response = await fetch('http://localhost:8000/api/upload-chunked', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Chunk upload failed with status: ${response.status}`);
      }
      
      const result = await response.json();
      if (result.success) {
        uploadedChunks.add(chunkIndex);
        
        // Optional: Update progress
        const progress = Math.round((uploadedChunks.size / totalChunks) * 100);
        console.log(`Upload progress: ${progress}%`);
      }
    }
    
    // All chunks uploaded successfully, now request the server to combine them
    // This assumes you have a separate endpoint to complete the upload
    const completeResponse = await fetch('http://localhost:8000/api/finalize-upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        fileId, 
        filename: file.name 
      }),
    });
    
    if (!completeResponse.ok) {
      throw new Error(`Failed to complete upload: ${completeResponse.status}`);
    }
    
    return await completeResponse.json();
  } catch (error) {
    console.error('Error uploading file:', error);
    
    throw error;
  }
}


  /**
   * Retrieves the API definition from the server given the file ID and description.
   * @param fileId The ID of the file to retrieve the API for.
   * @param description The description of the API.
   * @returns The API definition as a JSON object.
   */
export async function getAPIByFileId(fileId: string, description: string, selectedModel: string) {
  // make a get request with fileId and description
  const response = await fetch(`http://localhost:8000/api/extract-api/?fileId=${fileId}&description=${description}&selectedModel=${selectedModel}`);
  
  if (!response.ok) {
    throw new Error(`Error: ${response.status}`);
  }
  
  const data = await response.json();

  return data;
}


  /**
   * Uploads a file and returns the API definition of the file.
   * @param request The request body should contain a 'file' key with the file to upload, and a 'description' key with a description of the API.
   * @returns The API definition as a JSON object.
   */
export async function POST(request: FormData) {
  const file = request.get('file') as File;
  const description = request.get('description') as string;
  const result = await uploadLargeFile(file, 750 * 1024); // 750KB chunk size
  return new Response(JSON.stringify(result));
}

  /**
   * Retrieves the API definition of the file by its ID and description.
   * @param request The request body should contain a 'fileId' key with the ID of the file, and a 'description' key with a description of the API.
   * @returns The API definition as a JSON object.
   */
export async function GET(request: FormData){
  const fileId = request.get('fileId') as string;
  const description = request.get('description') as string;
  const selectedModel = request.get('model') as string;
  const result = await getAPIByFileId(fileId, description, selectedModel);

  //TODO: remove this after done testing
  // const result = {
  //   "curlCommand": "curl -X GET 'https://forecast7.com/en/37d77n122d42/san-francisco/?format=json' \\\n  -H ':authority: forecast7.com' \\\n  -H ':method: GET' \\\n  -H ':path: /en/37d77n122d42/san-francisco/?format=json' \\\n  -H ':scheme: https' \\\n  -H 'accept: application/json, text/plain, */*' \\\n  -H 'accept-encoding: gzip, deflate, br, zstd' \\\n  -H 'accept-language: en-US,en;q=0.9' \\\n  -H 'cache-control: no-cache' \\\n  -H 'dnt: 1' \\\n  -H 'origin: https://weatherwidget.io' \\\n  -H 'pragma: no-cache' \\\n  -H 'priority: u=1, i' \\\n  -H 'referer: https://weatherwidget.io/' \\\n  -H 'sec-ch-ua: \"Not A(Brand\";v=\"8\", \"Chromium\";v=\"132\", \"Google Chrome\";v=\"132\"' \\\n  -H 'sec-ch-ua-mobile: ?0' \\\n  -H 'sec-ch-ua-platform: \"macOS\"' \\\n  -H 'sec-fetch-dest: empty' \\\n  -H 'sec-fetch-mode: cors' \\\n  -H 'sec-fetch-site: cross-site' \\\n  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'",
  //   "requestDetails": {
  //       "method": "GET",
  //       "url": "https://forecast7.com/en/37d77n122d42/san-francisco/?format=json",
  //       "contentType": "application/json; charset=utf-8",
  //       "responseStatus": 200,
  //       "responseSize": 4791
  //   }
//}

  return new Response(JSON.stringify(result));
}

/**
 * Function that sends a proxy post request to backend proxy endpoint
 * To be used for running curl commands
 */
export async function proxy(request: Request) {
  // Read the request body properly
  const body = await request.text(); // Read as text instead of passing a stream

  const response = await fetch('http://localhost:8000/proxy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', // Ensure JSON content type
    },
    body: JSON.stringify({ body: body, url: request.url, method: request.method, headers: Object.fromEntries(request.headers) }),
  });

  console.log(response.status);
  return response
}
