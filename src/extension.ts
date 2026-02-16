import * as SDK from "azure-devops-extension-sdk";
import { PdfDiffViewer } from './pr-diff-viewer';
import { CommonServiceIds, IProjectPageService, getClient } from "azure-devops-extension-api";
import { GitRestClient, VersionControlRecursionType, GitVersionType, GitChange } from "azure-devops-extension-api/Git";

// Initialize the Azure DevOps SDK
SDK.init();

let diffViewer: PdfDiffViewer | null = null;

async function initialize() {
    try {
        await SDK.ready();
        
        console.log('PDF Diff Viewer extension loaded');

        const loading = document.getElementById('loading');
        const errorDiv = document.getElementById('error');

        if (loading) {
            loading.style.display = 'block';
        }

        // Get the configuration context from Azure DevOps
        const config = SDK.getConfiguration();
        console.log('Configuration:', config);

        // Initialize the diff viewer
        diffViewer = new PdfDiffViewer();

        try {
            // Check if we have file context (content handler scenario)
            if (config.onBuildChanged || config.onViewDisplayed) {
                // This is a content handler - wait for file information
                if (config.onBuildChanged) {
                    config.onBuildChanged(async (args: any) => {
                        await loadPdfsFromContext(args);
                    });
                }
                
                if (config.onViewDisplayed) {
                    config.onViewDisplayed(async (args: any) => {
                        await loadPdfsFromContext(args);
                    });
                }
            } else {
                // Try to load from current context
                await loadPdfsFromContext(config);
            }

            if (loading) {
                loading.style.display = 'none';
            }

            // Set up event listeners
            setupEventListeners();

            // Render the initial view
            await diffViewer.render('side-by-side');
            
            // Notify Azure DevOps that the extension has loaded successfully
            SDK.notifyLoadSucceeded();

        } catch (error) {
            console.error('Error loading PDFs:', error);
            if (errorDiv) {
                errorDiv.textContent = `Error loading PDF files: ${error}`;
                errorDiv.style.display = 'block';
            }
            if (loading) {
                loading.style.display = 'none';
            }
            
            // Still notify load succeeded even if PDF loading failed
            SDK.notifyLoadSucceeded();
        }

    } catch (error) {
        console.error('Error initializing extension:', error);
        const errorDiv = document.getElementById('error');
        if (errorDiv) {
            errorDiv.textContent = `Error initializing extension: ${error}`;
            errorDiv.style.display = 'block';
        }
        
        // Notify load succeeded to prevent Azure DevOps from waiting indefinitely
        SDK.notifyLoadSucceeded();
    }
}

function setupEventListeners() {
    // View mode buttons
    const sideBySideBtn = document.getElementById('side-by-side-btn');
    const inlineBtn = document.getElementById('inline-btn');
    const pixelDiffBtn = document.getElementById('pixel-diff-btn');

    if (sideBySideBtn) {
        sideBySideBtn.addEventListener('click', () => {
            setActiveButton('side-by-side-btn');
            if (diffViewer) {
                diffViewer.render('side-by-side');
            }
        });
    }

    if (inlineBtn) {
        inlineBtn.addEventListener('click', () => {
            setActiveButton('inline-btn');
            if (diffViewer) {
                diffViewer.render('inline');
            }
        });
    }

    if (pixelDiffBtn) {
        pixelDiffBtn.addEventListener('click', () => {
            setActiveButton('pixel-diff-btn');
            if (diffViewer) {
                diffViewer.render('pixel-diff');
            }
        });
    }

    // Page navigation
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');

    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (diffViewer) {
                diffViewer.previousPage();
            }
        });
    }

    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            if (diffViewer) {
                diffViewer.nextPage();
            }
        });
    }
}

async function loadPdfsFromContext(context: any): Promise<void> {
    try {
        console.log('Loading PDFs from context:', context);

        // Get configuration from Azure DevOps - this should contain PR context for PR tabs
        const config = SDK.getConfiguration();
        const host = SDK.getHost();
        
        console.log('SDK Configuration:', config);
        console.log('SDK Host:', host);
        
        // Get project context
        const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
        const project = await projectService.getProject();

        if (!project) {
            throw new Error('Could not get project context from SDK');
        }

        console.log('Project:', project);

        // Try to get PR ID from various possible sources in the SDK
        let pullRequestId: number = 0;
        let repositoryId: string = '';
        
        // Check if context has PR information
        if (context && typeof context === 'object') {
            pullRequestId = context.pullRequestId || context.id || context.pullRequest?.pullRequestId || 0;
            repositoryId = context.repositoryId || context.repository?.id || context.repository || '';
            console.log('From context - PR ID:', pullRequestId, 'Repo ID:', repositoryId);
        }
        
        // Try config object
        if (!pullRequestId && config) {
            pullRequestId = (config as any).pullRequestId || (config as any).id || (config as any).pullRequest?.pullRequestId || 0;
            repositoryId = (config as any).repositoryId || (config as any).repository?.id || (config as any).repository || '';
            console.log('From config - PR ID:', pullRequestId, 'Repo ID:', repositoryId);
        }
        
        // Try host object
        if (!pullRequestId && host) {
            pullRequestId = (host as any).pullRequestId || (host as any).id || 0;
            repositoryId = (host as any).repositoryId || (host as any).repository?.id || (host as any).repository || '';
            console.log('From host - PR ID:', pullRequestId, 'Repo ID:', repositoryId);
        }
        
        console.log('Resolved - PR ID:', pullRequestId, 'Repository ID:', repositoryId);
        
        if (!pullRequestId) {
            throw new Error(`Pull Request ID not found. Please ensure this tab is opened in a Pull Request context.`);
        }
        
        if (!repositoryId) {
            throw new Error(`Repository ID not found. PR ID: ${pullRequestId}`);
        }

        // Get Git client
        const gitClient = getClient(GitRestClient);

        // Get the pull request details
        console.log(`Fetching PR ${pullRequestId} from repository ${repositoryId} in project ${project.name}`);
        const pullRequest = await gitClient.getPullRequest(repositoryId, pullRequestId, project.name);
        console.log('Pull request:', pullRequest);

        if (!pullRequest) {
            throw new Error(`Could not fetch pull request ${pullRequestId} from repository ${repositoryId}`);
        }

        // Get the changes in the PR
        const iterations = await gitClient.getPullRequestIterations(repositoryId, pullRequestId, project.name);
        console.log('Iterations:', iterations);
        
        if (!iterations || iterations.length === 0) {
            throw new Error('No iterations found in Pull Request');
        }

        const latestIteration = iterations[iterations.length - 1];
        const changes = await gitClient.getPullRequestIterationChanges(
            repositoryId,
            pullRequestId,
            latestIteration.id!,
            project.name
        );

        console.log('Changes:', changes);

        // Find the first PDF file in the changes
        const pdfChange = changes.changeEntries?.find((change: GitChange) => 
            change.item?.path?.toLowerCase().endsWith('.pdf')
        );

        if (!pdfChange || !pdfChange.item) {
            throw new Error('No PDF files found in this Pull Request. Please add a PDF file to the PR to use this viewer.');
        }

        console.log('Found PDF file:', pdfChange.item.path);

        // Fetch the base and head versions of the PDF
        const pdfPath = pdfChange.item.path!;
        const baseCommitId = pullRequest.lastMergeSourceCommit?.commitId;
        const headCommitId = pullRequest.lastMergeTargetCommit?.commitId;

        console.log('Base commit:', baseCommitId, 'Head commit:', headCommitId);

        if (!baseCommitId || !headCommitId) {
            throw new Error('Could not determine source and target commits for this Pull Request');
        }

        // Fetch the PDF files
        const baseData = await fetchPdfFile(gitClient, repositoryId, pdfPath, baseCommitId);
        const headData = await fetchPdfFile(gitClient, repositoryId, pdfPath, headCommitId);

        if (diffViewer) {
            await diffViewer.loadPdfsFromData(baseData, headData);
        }

    } catch (error) {
        console.error('Error loading PDFs from context:', error);
        throw error;
    }
}

async function fetchPdfFile(gitClient: GitRestClient, repositoryId: string, path: string, commitId: string): Promise<Uint8Array> {
    try {
        console.log(`Fetching PDF: repo=${repositoryId}, path=${path}, commit=${commitId}`);
        
        // Fetch the file content at the specific commit
        const item = await gitClient.getItem(
            repositoryId,
            path,
            undefined, // project
            undefined, // scopePath
            VersionControlRecursionType.None,
            false, // includeContentMetadata
            false, // latestProcessedChange
            false, // download
            {
                version: commitId,
                versionType: GitVersionType.Commit,
                versionOptions: 0
            }
        );

        if (!item || !item.content) {
            throw new Error(`Could not fetch file content for ${path}`);
        }

        // Convert base64 content to Uint8Array
        const base64Content = item.content;
        const binaryString = atob(base64Content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        return bytes;
    } catch (error) {
        console.error(`Error fetching PDF file ${path}:`, error);
        throw error;
    }
}

function setActiveButton(activeId: string) {
    const buttons = ['side-by-side-btn', 'inline-btn', 'pixel-diff-btn'];
    buttons.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            if (id === activeId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
    if (diffViewer) {
        diffViewer.destroy();
    }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
