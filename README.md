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

Note: `npm run dev` uses the **dev Firebase project** from `.env`.
If you run `npm run preview` (or deploy) without rebuilding, you might accidentally be serving the last **production-mode** build from `dist` (which reads `.env.production`).

### Local Development (Recommended for Phone Auth)

Firebase Phone Authentication often fails on `localhost` due to reCAPTCHA/app verification (`auth/invalid-app-credential`).
For reliable local development, use the Firebase **Auth Emulator**.

1. Set `VITE_USE_EMULATORS=auto` (or `true`) in your local env (example: `.env.local`).

2. Start emulators:

```bash
npm run emulators
```

3. Start the web app:

```bash
npm run dev
```

Emulator UI: `http://localhost:4000`

### Local Development (Real SMS on localhost)

If you want to test **real SMS** from `localhost` (no emulators), `auth/invalid-app-credential` is almost always caused by Firebase/Google Cloud configuration (not React code).

Checklist:

1. Firebase Console → **Authentication** → **Settings** → **Authorized domains**
   - Ensure `localhost` (and optionally `127.0.0.1`) is present.

2. Google Cloud Console → **APIs & Services** → **Credentials** → your **API key**
   - If **Application restrictions** = HTTP referrers, add:
     - `http://localhost:*/*`
     - `http://127.0.0.1:*/*`
   - For quick testing, temporarily set restrictions to **None**.
   - If you use **API restrictions**, ensure Firebase/Auth related APIs are allowed.

3. Firebase Phone Auth + reCAPTCHA Enterprise
   - If you see logs like: "Failed to initialize reCAPTCHA Enterprise config. Triggering the reCAPTCHA v2 verification." and still get `INVALID_APP_CREDENTIAL`, your **reCAPTCHA Enterprise setup is blocking localhost**.
   - Fix options:
     - Firebase Console → **Authentication** → **Settings** → **reCAPTCHA / Enterprise**: disable Enterprise (or switch to v2) for the dev project, OR
     - Google Cloud Console → **reCAPTCHA Enterprise** → **Keys**: ensure the web key allows `localhost` / `127.0.0.1`.

4. Browser checks
   - Disable ad blockers / privacy extensions for localhost.
   - Try a clean Incognito window.
   - Ensure third-party cookies aren’t fully blocked.

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

### Deploy Dev vs Prod (separate Firebase projects)

- Dev deploy (builds with development env and deploys to the dev hosting site):
  - `firebase deploy --only hosting:momsfitnessmojo-dev --project momsfitnessmojo-dev`

- Prod deploy (builds with production env and deploys to the prod hosting site):
  - `firebase deploy --only hosting:momsfitnessmojo-65d00 --project momsfitnessmojo-65d00`

Notes:

- Vite environment variables are baked into the built JS bundle. The Firebase Hosting project you deploy to does **not** change which Firebase project the frontend calls.
- This repo uses Firebase Hosting targets (see firebase.json / .firebaserc) so dev and prod builds use different predeploy build modes.

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
