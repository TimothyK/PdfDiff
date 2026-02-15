# PDF Diff Viewer

Azure DevOps extension for viewing PDF file diffs in pull requests with multiple view modes.

![PDF Diff Viewer UI](https://github.com/user-attachments/assets/73a1ea62-a3fc-4a47-afe1-bc9b5c53523e)

## Features

- **Side-by-Side View**: Compare original and modified PDF files side by side
- **Inline View**: View changes inline with clear indicators for additions and removals
- **Pixel Diff View**: Visualize pixel-level differences between PDF pages

## Installation

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Azure DevOps organization (for publishing)

### Building the Extension

1. Clone the repository:
   ```bash
   git clone https://github.com/TimothyK/PdfDiff.git
   cd PdfDiff
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Package the extension:
   ```bash
   npm run package
   ```

This will create a `.vsix` file that can be uploaded to the Azure DevOps marketplace.

## Development

### Project Structure

```
PdfDiff/
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── pr-diff-viewer.ts     # PDF diff viewer component
│   ├── pdf-renderer.ts       # PDF rendering logic
│   └── pr-viewer.html        # UI for the diff viewer
├── images/
│   └── logo.png              # Extension logo
├── dist/                     # Build output (generated)
├── vss-extension.json        # Extension manifest
├── package.json              # Node.js package configuration
├── tsconfig.json             # TypeScript configuration
└── webpack.config.js         # Webpack build configuration
```

### Running Locally

1. Start the development build with watch mode:
   ```bash
   npm run dev
   ```

2. For testing, you'll need to:
   - Package the extension: `npm run package`
   - Upload to Azure DevOps as a private extension
   - Install it in your organization
   - Test with a pull request containing PDF files

## Usage

Once installed in your Azure DevOps organization:

1. Create or open a pull request that includes changes to PDF files
2. Navigate to the "PDF Diff" tab in the pull request
3. Use the toolbar buttons to switch between view modes:
   - **Side by Side**: Compare pages side by side
   - **Inline**: View removed and added pages inline
   - **Pixel Diff**: See exact pixel differences highlighted
4. Use the Previous/Next buttons to navigate through pages

## Technologies Used

- **TypeScript**: Main programming language
- **Azure DevOps Extension SDK**: Integration with Azure DevOps
- **PDF.js**: PDF rendering and parsing
- **Pixelmatch**: Pixel-level comparison
- **Webpack**: Module bundler

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Notes

- The extension requires Azure DevOps organization permissions to access pull request files
- PDF rendering is done client-side in the browser
- Large PDF files may take longer to process and compare
