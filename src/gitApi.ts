export async function fetchPdfFile(
    baseUri: string, 
    projectName: string, 
    repositoryId: string, 
    path: string, 
    commitId: string
): Promise<Uint8Array> {
    const apiUrl = `${baseUri}${projectName}/_apis/git/repositories/${repositoryId}/items?path=${encodeURIComponent(path)}&versionType=commit&version=${commitId}&includeContent=true&api-version=7.0`;
    
    console.log(`Fetching: ${apiUrl}`);
    
    const response = await fetch(apiUrl, {
        headers: {
            'Accept': 'application/json'
        },
        credentials: 'include'
    });
    
    console.log(`Response status: ${response.status}`);
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.content) {
        throw new Error(`No content in response for ${path}`);
    }
    
    console.log(`Got content, length: ${data.content.length} chars`);
    
    // Convert base64 content to Uint8Array
    const base64Content = data.content;
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    console.log(`Converted to Uint8Array, ${bytes.length} bytes`);
    return bytes;
}
