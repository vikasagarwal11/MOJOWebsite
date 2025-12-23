# Cursor Agent CLI Integration Guide

This guide explains how to use the Cursor Agent CLI with the MOJO Website project for enhanced development workflows.

## Overview

The Cursor Agent CLI allows you to leverage Cursor's AI capabilities from the command line, enabling:
- Automated code reviews
- Code generation and refactoring
- Documentation generation
- Integration with CI/CD pipelines
- Headless development workflows

## Installation

### Windows (PowerShell)
```powershell
# Download and install
Invoke-WebRequest -Uri 'https://cursor.com/install' -OutFile 'install.ps1'
.\install.ps1

# Verify installation
cursor --version
```

### Linux/macOS
```bash
# Install using curl
curl https://cursor.com/install -fsS | bash

# Verify installation
cursor --version
```

## Project Configuration

### .cursorrules File
The project includes a comprehensive `.cursorrules` file that defines:
- Tech stack and architecture principles
- Coding standards and best practices
- Firebase integration guidelines
- **Environment file awareness** - Always references .env file
- UI/UX requirements
- Performance and accessibility standards

### Scripts Directory
- `scripts/code-review.ps1` - PowerShell code review script
- `scripts/code-review.sh` - Bash code review script
- `check-env-simple.ps1` - Environment configuration checker

## Usage Examples

### 1. Environment Awareness
```powershell
# Check current environment configuration
.\check-env-simple.ps1

# This will show Cursor your current .env setup
# Project ID: momfitnessmojo
# Environment: development
# Storage Bucket: gs://mojomediafiles
```

### 2. Code Review
```powershell
# Run automated code review (includes env check)
.\scripts\code-review-simple.ps1

# Review specific directory
.\scripts\code-review.ps1 -Path "src/components"

# Verbose output
.\scripts\code-review.ps1 -Verbose
```

### 3. Service Worker Enhancement
```bash
# Analyze and improve service worker
cursor agent "Analyze the service worker and suggest PWA improvements for a fitness community website"
```

### 3. Component Generation
```bash
# Generate a new React component following project patterns
cursor agent "Create a new EventCard component with Material 3 design, TypeScript, and proper Firebase integration"
```

### 4. Code Refactoring
```bash
# Refactor existing code
cursor agent "Refactor the EventFormModal component to use Riverpod state management and improve accessibility"
```

## Integration with Deployment

### Development Deployment
The `deploy-dev.ps1` script now includes pre-deployment checks:
- Automated code review
- ESLint validation
- Test execution
- Build verification

```powershell
# Deploy with all checks
.\deploy-dev.ps1

# Skip checks (not recommended)
.\deploy-dev.ps1 -SkipChecks
```

### CI/CD Integration
You can integrate the CLI into your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Run Code Review
  run: |
    cursor agent "Review the codebase for security issues and performance optimizations"
  
- name: Generate Documentation
  run: |
    cursor agent "Generate API documentation for all services in src/services/"
```

## Advanced Features

### 1. Automated Documentation
```bash
# Generate component documentation
cursor agent "Generate comprehensive documentation for all React components in src/components/"

# Create API documentation
cursor agent "Document all Firebase Cloud Functions and their parameters"
```

### 2. Performance Optimization
```bash
# Analyze bundle size and performance
cursor agent "Analyze the React app for performance bottlenecks and suggest optimizations"

# Optimize images and assets
cursor agent "Review image usage and suggest WebP conversion and lazy loading strategies"
```

### 3. Security Auditing
```bash
# Security review
cursor agent "Perform security audit of Firebase rules, authentication, and data handling"

# Dependency audit
cursor agent "Review package.json dependencies for security vulnerabilities"
```

### 4. Testing Enhancement
```bash
# Generate test cases
cursor agent "Create comprehensive test cases for the EventService and AttendeeService"

# Improve test coverage
cursor agent "Analyze test coverage and suggest additional test scenarios"
```

## Best Practices

### 1. Regular Code Reviews
- Run automated code reviews before each deployment
- Use the CLI to review pull requests
- Set up scheduled reviews for critical components

### 2. Documentation Maintenance
- Generate documentation after major changes
- Keep API documentation up to date
- Document new features and components

### 3. Performance Monitoring
- Regular performance analysis
- Bundle size monitoring
- PWA functionality testing

### 4. Security Auditing
- Regular security reviews
- Dependency updates
- Firebase rules validation

## Troubleshooting

### Common Issues

1. **CLI Not Found**
   - Ensure Cursor CLI is installed and in PATH
   - Restart terminal after installation

2. **Permission Errors**
   - Run scripts with appropriate permissions
   - Check file system permissions

3. **Network Issues**
   - Ensure stable internet connection
   - Check firewall settings

### Getting Help

- Check Cursor CLI documentation
- Review project `.cursorrules` file
- Run scripts with `-Verbose` flag for detailed output

## Future Enhancements

- Integration with VS Code extensions
- Custom MCP (Model Context Protocol) servers
- Advanced caching strategies
- Real-time collaboration features

## Conclusion

The Cursor Agent CLI provides powerful capabilities for enhancing your development workflow. By following this guide and using the provided scripts, you can:

- Maintain code quality through automated reviews
- Generate comprehensive documentation
- Optimize performance and security
- Streamline deployment processes
- Improve overall development efficiency

Remember to regularly update the `.cursorrules` file as your project evolves and requirements change.
