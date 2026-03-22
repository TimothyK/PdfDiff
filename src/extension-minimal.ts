import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api";
import { PdfRenderer } from './pdf-renderer';
import { PdfDiffViewer } from './pr-diff-viewer';

async function fetchPdfFile(baseUri: string, repositoryId: string, path: string): Promise<ArrayBuffer> {
    const url = `${baseUri}/_apis/git/repositories/${repositoryId}/items?path=${encodeURIComponent(path)}&api-version=7.0&$format=octetStream`;
    console.log('Fetching PDF from:', url);
    
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
            'Accept': 'application/octet-stream'
        }
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
    }

    return await response.arrayBuffer();
}

async function initialize() {
    console.log('Testing with fetch logic');
    try {
        SDK.init();
    } catch (e) {
        console.log('SDK init error:', e);
    }
    
    await SDK.ready();
    console.log('SDK ready');
    
    const config = SDK.getConfiguration();
    console.log('Config:', config);
    
    const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
    const project = await projectService.getProject();
    console.log('Project:', project);
    
    // Test fetch function exists
    console.log('fetchPdfFile function available:', typeof fetchPdfFile === 'function');
    
    // Test PDF.js import
    console.log('PdfRenderer class available:', typeof PdfRenderer === 'function');
    // Test PdfDiffViewer import
    console.log('PdfDiffViewer class available:', typeof PdfDiffViewer === 'function');
    
    
    SDK.notifyLoadSucceeded();
}

initialize().catch(error => {
    console.error('Extension initialization failed:', error);
});
