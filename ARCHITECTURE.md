# PDF Diff Viewer - Architecture Overview

## Extension Structure

This Azure DevOps extension provides a custom PDF diff viewer for pull requests with three viewing modes.

## Components

### 1. Extension Manifest (`vss-extension.json`)

Defines the extension metadata and contributions:
- Registers the extension with Azure DevOps
- Declares required permissions (code read/write)
- Defines contribution points for PR tabs and file diff handlers
- Specifies file types (.pdf) that trigger the custom viewer

### 2. Main Extension Entry (`src/extension.ts`)

Initializes the Azure DevOps SDK and sets up the viewer:
- Initializes Azure DevOps Extension SDK
- Loads PDF files from the pull request
- Sets up event listeners for view mode switching and page navigation
- Manages the lifecycle of the diff viewer

### 3. PDF Renderer (`src/pdf-renderer.ts`)

Handles PDF rendering using PDF.js:
- Loads PDF documents from URLs or binary data
- Renders individual pages to canvas elements
- Manages page scaling and viewport calculations
- Provides cleanup methods for resource management

### 4. Diff Viewer Component (`src/pr-diff-viewer.ts`)

Implements the three viewing modes:

#### Side-by-Side View
- Displays original (base) and modified (head) PDFs side by side
- Shows corresponding pages from both versions simultaneously
- Handles cases where page counts differ

#### Inline View
- Shows removed pages (from base) followed by added pages (from head)
- Uses color coding (red for removed, green for added)
- Provides clear visual distinction between versions

#### Pixel Diff View
- Performs pixel-by-pixel comparison using the pixelmatch library
- Highlights exact differences between page versions
- Shows difference count for each page
- Displays all three canvases: original, modified, and diff

### 5. User Interface (`src/pr-viewer.html`)

Provides the interactive UI:
- Toolbar with view mode selection buttons
- Page navigation controls (previous/next)
- Containers for each view mode
- Loading and error states
- Responsive design for various screen sizes

## Data Flow

1. Extension loads when user views a PR with PDF changes
2. Azure DevOps SDK initializes and provides PR context
3. PDF files are fetched from the repository
4. PDF.js parses and renders the documents
5. User selects view mode via toolbar
6. Appropriate view component renders the comparison
7. User navigates through pages using navigation controls

## Dependencies

- **azure-devops-extension-sdk**: Integration with Azure DevOps
- **pdfjs-dist**: PDF rendering and parsing
- **pixelmatch**: Pixel-level image comparison
- **TypeScript**: Type-safe development
- **Webpack**: Module bundling and build

## Build Process

1. TypeScript compilation (`tsc`)
2. Module bundling (`webpack`)
3. Asset copying (HTML, CSS, images)
4. Extension packaging (`tfx-cli`)
5. VSIX file creation for distribution

## Future Enhancements

Potential improvements for future versions:
- Zoom controls for better detail viewing
- Text extraction and comparison
- Annotation support
- Side-by-side synchronization (synchronized scrolling)
- Performance optimization for large PDFs
- Support for other document formats
- Integration with Azure DevOps API for real PDF file fetching
