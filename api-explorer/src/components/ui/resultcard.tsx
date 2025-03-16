"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Check, Terminal, Code, Play, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { proxy } from "@/api/route";
import { json } from "stream/consumers";

interface CurlCommandDisplayProps {
  curlCommand: string;
  onRunAgain?: () => void;
  className?: string;
}

export default function CurlCommandDisplay({
  curlCommand,
  onRunAgain,
  className,
}: CurlCommandDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState("curl");
  const [editableCommand, setEditableCommand] = useState(curlCommand);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{ status?: number; body?: string; error?: string; headers?: Record<string, string> } | null>(null);
  const [showRunner, setShowRunner] = useState(false);

  // Function to parse the curl command and extract readable parts
  const parseCommand = (cmd: string) => {
    const parts = {
      method: cmd.match(/-X\s+([A-Z]+)/)?.[1] || "GET",
      url: cmd.match(/"([^"]+)"|'([^']+)'|([^\s]+)$/)?.[0]?.replace(/['"]/g, "") || "",
      headers: [] as { name: string; value: string }[],
      data: cmd.match(/-d\s+'([^']+)'|-d\s+"([^"]+)"|-d\s+([^\s]+)/)?.[0] || "",
    };

    // Extract headers
    const headerMatches = cmd.matchAll(/-H\s+["']([^:]+):\s*([^"']+)["']/g);
    for (const match of headerMatches) {
      if (match[1] && match[2]) {
        parts.headers.push({
          name: match[1].trim(),
          value: match[2].trim(),
        });
      }
    }

    return parts;
  };
  const parseUrlParams = (url: string) => {
  try {
    const urlObj = new URL(url);
    const params: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  } catch (e) {
    return {};
  }
};

  const parsed = parseCommand(curlCommand);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Function to execute the API request using the parsed curl command
  const runCurlCommand = async () => {
    setIsRunning(true);
    setResult(null);
    
    try {
      const parsed = parseCommand(editableCommand);
      
      // Convert curl command to fetch request
      const headers: Record<string, string> = {};
      parsed.headers.forEach(header => {
        headers[header.name] = header.value;
      });
      
      let body = undefined;
      if (parsed.data) {
        // Extract the actual data content from the -d parameter
        const dataMatch = parsed.data.match(/-d\s+['"](.+)['"]/);
        if (dataMatch && dataMatch[1]) {
          body = dataMatch[1];
        } else {
          const simpleDataMatch = parsed.data.match(/-d\s+(.+)/);
          if (simpleDataMatch && simpleDataMatch[1]) {
            body = simpleDataMatch[1];
          }
        }
      }
      
      /**export async function proxy(request: Request) {
  const response = await fetch('http://localhost:8000/api/proxy', {
    method: 'POST',
    body: request.body,
  });
  return response;
} */
      const response = await proxy(new Request(parsed.url, {
        method: parsed.method,
        headers: headers,
        body: body,
      }));

      // parse proxy response
      if (!response.ok) {
        throw new Error(response.statusText);
      }

      const proxyData = await response.json();

      const serverResponse = proxyData.server_response;

      const resHeadersRecord: Record<string, string> = serverResponse.headers || {};

      setResult({
        status: serverResponse.status_code,
        body: typeof serverResponse.body === 'object' ? 
          JSON.stringify(serverResponse.body, null, 2) : 
          serverResponse.body,
        headers: resHeadersRecord,
      });

      } catch (err: any) {
        setResult({
          status: 500,
          error: err.message || "Failed to execute command"
        });
      } finally {
        setIsRunning(false);
      }
    };

  return (
    <div className="space-y-4">
      <Card className={cn("w-full", className)}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xl flex items-center">
            <Terminal className="mr-2 h-5 w-5" />
            API Request Command
          </CardTitle>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
              className="h-8"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" /> Copy
                </>
              )}
            </Button>
            {onRunAgain && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRunAgain}
                className="h-8"
              >
                <Play className="h-4 w-4 mr-1" /> New Request
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRunner(!showRunner)}
              className="h-8"
            >
              <Terminal className="h-4 w-4 mr-1" /> {showRunner ? "Hide Runner" : "Run Command"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            defaultValue="curl"
            value={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="curl">
                <Code className="h-4 w-4 mr-1" /> curl Command
              </TabsTrigger>
              <TabsTrigger value="details">
                <Terminal className="h-4 w-4 mr-1" /> Details
              </TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-0">
              <div className="bg-gray-100 dark:bg-gray-800 rounded-md p-4 overflow-x-auto">
                <pre className="text-sm whitespace-pre-wrap break-all">{curlCommand}</pre>
              </div>
            </TabsContent>
            <TabsContent value="details" className="mt-0">
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium mb-1">Method</h3>
                  <Alert>
                    <AlertDescription className="text-sm">
                      {parsed.method}
                    </AlertDescription>
                  </Alert>
                </div>
                
                <div>
                  <h3 className="text-sm font-medium mb-1">URL</h3>
                  <Alert>
                    <AlertDescription className="text-sm break-all">
                      {parsed.url}
                    </AlertDescription>
                  </Alert>
                </div>
                {Object.keys(parseUrlParams(parsed.url)).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-1">URL Parameters</h3>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-md p-3 overflow-x-auto">
                      <div className="grid grid-cols-1 gap-2">
                        {Object.entries(parseUrlParams(parsed.url)).map(([key, value], index) => (
                          <div key={index} className="grid grid-cols-3 gap-2">
                            <span className="font-medium text-sm col-span-1 break-all">{key}:</span>
                            <span className="text-sm col-span-2 break-all">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {parsed.headers.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-1">Headers</h3>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-md p-3 overflow-x-auto">
                      <div className="grid grid-cols-1 gap-2">
                        {parsed.headers.map((header, index) => (
                          <div key={index} className="grid grid-cols-3 gap-2">
                            <span className="font-medium text-sm col-span-1 break-all">{header.name}:</span>
                            <span className="text-sm col-span-2 break-all">{header.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                
                {parsed.data && (
                  <div>
                    <h3 className="text-sm font-medium mb-1">Data</h3>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-md p-4 overflow-x-auto">
                      <pre className="text-sm whitespace-pre-wrap break-all">{parsed.data}</pre>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {showRunner && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl flex items-center">
                <Terminal className="mr-2 h-5 w-5" />
                Run Custom Command
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea 
                className="font-mono h-32 resize-none"
                value={editableCommand}
                onChange={(e) => setEditableCommand(e.target.value)}
                placeholder="Edit your curl command here..."
              />
              
              <div className="flex justify-end">
                <Button
                  onClick={runCurlCommand}
                  disabled={isRunning}
                >
                  {isRunning ? (
                    <>
                      <RotateCw className="h-4 w-4 mr-1 animate-spin" /> Running...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-1" /> Run Command
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {result && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xl flex items-center">
                  <Code className="mr-2 h-5 w-5" />
                  Response
                  {result?.status && (
                    <span 
                      className={cn(
                        "ml-2 px-2 py-0.5 text-sm rounded-md",
                        result.status >= 200 && result.status < 300 
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      )}
                    >
                      Status: {result.status}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="output" className="w-full">
                  <TabsList className="grid w-full grid-cols-3 mb-4">
                    <TabsTrigger value="output">Response Body</TabsTrigger>
                    <TabsTrigger value="headers">Headers</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                  </TabsList>
                  <TabsContent value="output" className="mt-0">
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-md p-4 min-h-32 overflow-x-auto">
                      {result.error ? (
                        <pre className="text-sm text-red-600 dark:text-red-400 whitespace-pre-wrap">{result.error}</pre>
                      ) : result.body ? (
                        <pre className="text-sm whitespace-pre-wrap">{result.body}</pre>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No response body</p>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="headers" className="mt-0">
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-md p-4 min-h-32 overflow-x-auto">
                      {result.headers ? (
                        <div className="grid grid-cols-1 gap-2">
                          {Object.entries(result.headers).map(([key, value], index) => (
                            <div key={index} className="grid grid-cols-3 gap-2">
                              <span className="font-medium text-sm col-span-1 break-all">{key}:</span>
                              <span className="text-sm col-span-2 break-all">{value}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No headers received</p>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="details" className="mt-0">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-sm font-medium mb-1">Status</h3>
                        <Alert>
                          <AlertDescription className={cn(
                            "text-sm",
                            result.status && result.status >= 200 && result.status < 300 
                              ? "text-green-600 dark:text-green-400" 
                              : "text-red-600 dark:text-red-400"
                          )}>
                            {result.status || "No status code received"}
                          </AlertDescription>
                        </Alert>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-medium mb-1">Command</h3>
                        <div className="bg-gray-100 dark:bg-gray-800 rounded-md p-3 overflow-x-auto">
                          <pre className="text-sm whitespace-pre-wrap break-all">{editableCommand}</pre>
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-medium mb-1">Execution Time</h3>
                        <Alert>
                          <AlertDescription className="text-sm">
                            {new Date().toLocaleTimeString()}
                          </AlertDescription>
                        </Alert>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}