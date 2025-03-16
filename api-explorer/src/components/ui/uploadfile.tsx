"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, FileUp, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { POST, GET } from "@/api/route";
import CurlCommandDisplay from "@/components/ui/resultcard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function HarFileUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [apiDescription, setApiDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileresult, setResult] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("o3-mini-2025-01-31");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setError(null);
    
    if (!selectedFile) {
      return;
    }
    
    if (!selectedFile.name.endsWith('.har')) {
      setError("Please upload a valid .har file");
      return;
    }
    
    setFile(selectedFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      setError("Please select a HAR file to upload");
      return;
    }
    
    if (!apiDescription.trim()) {
      setError("Please describe the API you want to extract");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("description", apiDescription);
      
      const response = await POST(formData);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      setFileId(data.fileId);
      
      const curlData = new FormData();
      curlData.append("fileId", data.fileId);
      curlData.append("description", apiDescription);
      curlData.append("model", selectedModel); // Add the selected model here too

      const curlResponse = await GET(curlData);
      const curlRes = await curlResponse.json();

      setResult(curlRes.curlCommand);

    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunAgain = () => {
    setFile(null);
    setApiDescription("");
    setError(null);
    setResult(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto py-8">
    {!fileresult ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">API Request Explorer</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="model-select" className="text-sm font-medium">
                  Select Model
                </label>
                <Select 
                  value={selectedModel} 
                  onValueChange={setSelectedModel}
                >
                  <SelectTrigger id="model-select" className="w-full">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="o3-mini-2025-01-31">o3-mini</SelectItem>
                    <SelectItem value="gpt-4o-2024-08-06">gpt-4o</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label htmlFor="har-file" className="text-sm font-medium">
                  Upload HAR File
                </label>
                <div className="grid w-full max-w-sm items-center gap-1.5">
                  <Input
                    id="har-file"
                    type="file"
                    accept=".har"
                    onChange={handleFileChange}
                    className="cursor-pointer"
                  />
                </div>
                {file && (
                  <p className="text-sm text-green-600">
                    Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <label htmlFor="api-description" className="text-sm font-medium">
                  Describe the API you want to extract
                </label>
                <Textarea
                  id="api-description"
                  placeholder="Example: Return the API that fetches the weather of San Francisco"
                  value={apiDescription}
                  onChange={(e) => setApiDescription(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
              
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !file || !apiDescription.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <FileUp className="mr-2 h-4 w-4" />
                    Extract API Request with {selectedModel === "o3-mini-2025-01-31" ? "o3-mini" : "gpt-4o"}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <CurlCommandDisplay 
          curlCommand={fileresult}
          onRunAgain={handleRunAgain}
        />
      )}
    </div>
  );
}