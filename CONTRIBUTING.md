# Contributing to PDF Diff Viewer

Thank you for your interest in contributing to the PDF Diff Viewer extension!

## Development Setup

1. Fork and clone the repository
2. Install Node.js (v16 or higher)
3. Install dependencies: `npm install`
4. Build the extension: `npm run build`

## Making Changes

1. Create a new branch for your feature/fix
2. Make your changes in the `src/` directory
3. Build and test your changes: `npm run build`
4. Package the extension: `npm run package`
5. Test the packaged `.vsix` file in Azure DevOps

## Code Style

- Follow the existing TypeScript code style
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

## Testing

- Ensure the extension builds without errors
- Test all three view modes (side-by-side, inline, pixel diff)
- Test with various PDF files (single page, multi-page, different sizes)
- Test page navigation

## Submitting Changes

1. Commit your changes with clear, descriptive messages
2. Push your branch to your fork
3. Create a pull request with a clear description of the changes
4. Wait for review and address any feedback

## Questions?

Feel free to open an issue for any questions or concerns.
