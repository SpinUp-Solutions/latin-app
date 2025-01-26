# Web app template

This template is configured to be a complete starter kit for the modern web developer. The stack includes:

- Typescript 💙
- NextJS ⚫️
- React ✅
- Redux 🟪
- Firebase 🔥
- Stripe 💰
- Tailwind 💨
- Remix UI 💿
- Jest 😉
- Playwright 🎪
- ESLint + Prettier 💻

It's designed to scale to multiple development environments with the scaffolding to handle many use cases. To get up and running:

### 1. Node
Make sure you have [NodeJS version 22](https://nodejs.org/en/download) installed. Follow the instructions at that link to install if you haven't already.
### 2. Fork
Fork this repo into the GitHub of your choice.
### 3. Clone
Clone the forked repo to your local environment. Check your new repository's link. If I wanted to clone this repo, the command would be:

```git clone https://github.com/chrisozgo99/nextjs-template.git```

### 4. Install packages:

```npm i```

### 5. Env files
Create `.env`, `.env.development`, `.env.staging`, and `.env.production` files in the project's root. You only need to configure `.env` now, but for projects that plan on having multiple environments, it will be beneficial to have all these files available.

### 6. Create a Firebase project
   a. Go to your [Firebase Dashboard](https://console.firebase.google.com/)
   
   b. Click **Create Project**
   
   c. Click through all the steps with your desired configuration
   
   d. Once you arrive at the Firebase dashboard, click the **gear icon** and **Project Settings**
   
   e. Scroll down and click **Add app**. Choose a **Web app** with the logo that looks like this: **</>**
   
   f. Give your app a name and click **Register app**
   
   g. Copy the firebaseConfig variable in the next step and enter it into your .env file in the following format:

```
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-auth-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-storage-bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id
```
Below that, in the env file, add the following as well:

```
NEXT_PUBLIC_APP_URL=https://your-website-url.com
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
```
Your configuration is complete!

### 7. Compile the app
Run the following to compile:

```npm run build```

Then

```npm run dev```

### 8. Let's go!
Your app should be visible at `http://localhost:3000`. Time to start building!
     


