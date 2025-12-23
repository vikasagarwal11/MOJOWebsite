# Mom's Fitness Mojo Community Website

A modern, responsive web application built for the Mom's Fitness Mojo community. This platform enables mothers to connect, share their fitness journeys, participate in events, and support each other in their wellness goals.

## 🌟 Features

- **User Authentication** - Phone-based authentication with Firebase
- **Event Management** - Create, view, and RSVP to fitness events
- **Media Gallery** - Upload and share photos/videos from fitness activities
- **Community Posts** - Share thoughts, experiences, and ask questions
- **Sponsor Integration** - View sponsor promotions and deals
- **Responsive Design** - Works seamlessly on desktop and mobile
- **PWA Support** - Installable as a mobile app

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend**: Firebase (Firestore, Authentication, Storage)
- **Icons**: Lucide React
- **Forms**: React Hook Form + Zod validation
- **Routing**: React Router v7
- **PWA**: Vite PWA Plugin

> 📋 **For project planning and feature roadmap, see [PROJECT_BACKLOG.md](./PROJECT_BACKLOG.md) in the docs directory**

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Firebase project

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/moms-fitness-mojo.git
cd moms-fitness-mojo
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

4. Start the development server:
```bash
npm run dev
```

## 🔧 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 📱 PWA Features

- Offline support
- Install prompt
- Background sync
- Push notifications (planned)

## 🔐 Firebase Security

The app uses Firebase Security Rules to ensure:
- Users can only access their own data
- Admins have elevated permissions
- Public content is accessible to all authenticated users
- Private content is restricted appropriately

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with ❤️ for the Mom's Fitness Mojo community
- Icons by [Lucide](https://lucide.dev/)
- UI inspiration from modern fitness apps