# Mom's Fitness Mojo Community Website

A modern, responsive web application built for the Mom's Fitness Mojo community.

## 📚 Documentation

All documentation has been moved to the [`docs/`](./docs/) directory.

**Quick Links:**

- [Getting Started Guide](./docs/README.md) - Installation and setup
- [Project Backlog](./docs/PROJECT_BACKLOG.md) - Feature planning and roadmap

## 🚀 Quick Start

### Local Development (Firebase Dev)

```bash
# Install dependencies
npm install

# Start development server (connects to Firebase dev project)
npm run dev

# Access the app
# - Frontend: http://localhost:5173
# - Data persists in Firebase dev project (momsfitnessmojo-dev)
```

### Production Deployment

```bash
# Switch to production project
firebase use prod

# Build for production
npm run build

# Deploy to production (hosting only)
firebase deploy --project=prod --only hosting

# Or deploy all services
firebase deploy --project=prod

# Switch back to dev
firebase use dev
```

### Environment Setup

- **Local Dev**: Uses `.env` with `VITE_USE_EMULATORS=false` → Connects to Firebase project: `momsfitnessmojo-dev` (data persists in cloud)
- **Production**: Uses `.env.production` with `VITE_USE_EMULATORS=false` → Connects to Firebase project: `momsfitnessmojo-65d00` (live site)

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend**: Firebase (Firestore, Authentication, Storage, Functions)
- **Icons**: Lucide React
- **Forms**: React Hook Form + Zod validation
- **Routing**: React Router v7
- **PWA**: Service Worker with Workbox

## 📖 Full Documentation

See the [`docs/`](./docs/) directory for comprehensive documentation including:

- Deployment guides for dev, staging, and production
- Environment setup and configuration
- Feature-specific documentation
- Troubleshooting guides
- API and architecture documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Built with ❤️ for the Mom's Fitness Mojo community
- Icons by [Lucide](https://lucide.dev/)
