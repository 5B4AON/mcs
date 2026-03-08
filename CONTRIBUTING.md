# Contributing to Morse Code Studio

Thank you for your interest in contributing! This guide explains how to get involved.

## Reporting Bugs

1. Search [existing issues](https://github.com/5B4AON/mcs/issues) to avoid duplicates.
2. Open a new issue using the **Bug Report** template.
3. Include your browser name/version, OS, and steps to reproduce the problem.

## Suggesting Features

Open an issue using the **Feature Request** template. Describe the use case and why it would benefit the project.

## Submitting Pull Requests

1. Fork the repository and create a branch from `main`.
2. Install dependencies: `npm install`
3. Make your changes and ensure the app builds: `ng build`
4. Run the tests: `ng test`
5. Commit with a clear, descriptive message.
6. Open a pull request against `main` and fill in the PR template.

## Development Setup

```bash
npm install
ng serve
```

Navigate to `http://localhost:4200/`. The app reloads automatically on source changes.

## Code Style

- Follow the existing code conventions in the project.
- Use the `.editorconfig` settings (2-space indent, single quotes in TypeScript).
- Keep components focused and services injectable.

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.
