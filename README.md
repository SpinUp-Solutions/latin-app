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

`git clone https://github.com/chrisozgo99/nextjs-template.git`

### 4. Install packages:

`npm i`

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

### 7. Environment-specific builds

You can either run the firebase functions directly from the server or choose to serve them locally (usefull for quick debugging). I will detail both workflows
First you have to login with the firebase cli and follow the steps

```bash
firebase login
```

This project supports **development**, **staging**, and **production** environments.
Keep in mind that each time you want to switch an environment **you also have to switch the firebase environment with**

```bash
firebase use [env]
```

The available firebase environments are declared in the `/.firebaserc` file

#### Development environment (default)- Remote

First you have to switch to the firebase env with:

```bash
firebase use dev
```

Then you can use these scripts for the NextJS App:

```
npm run dev            # Run the development server with dev environment
npm run build          # Build for dev environment
npm run start          # Start the server with dev environment
```

#### Staging environment - Remote

First you switch to the staging firebase env

```bash
firebase use staging
```

And then :

```
npm run dev:staging    # Run the development server with staging environment
npm run build:staging  # Build for staging environment
npm run start  # Start the server with staging environment
```

#### Production environment - Remote

Switch to the firebase prod env

```bash
firebase use prod
```

And then :

```
npm run dev:prod       # Run the development server with production environment
npm run build:prod     # Build for production environment
npm run start     # Start the server with production environment
```

#### Important note:

`npm start` runs the last built project. So, for example, if you want to start the dev env:

```bash
npm run build
npm start
```

If you want to build and run the staging env:

```bash
npm build:staging
npm start
```

#### Build all environments at once - Remote

Mainly for the sake of being complete

```

npm run build:all # Build for development, staging, and production environments

```

#### Development environment - Local

Change `USE_LOCAL_EMULATOR` in `firebase.ts` to `true`. This will connect to port 5001 where the functions communicate through

Change to firebase dev env

```bash
firebase use dev
```

Then serve the functions using this script

```bash
npm run functions:serve
```

For the staging env

```bash
firebase use staging
```

```bash
npm run functions:serve
```

For the prod env

```bash
firebase use prod
```

```bash
npm run functions:serve
```

### 8. Firebase Functions deployment scripts

These scripts are specific to deploying these functions to each environment. They first switch the firebase env to the one specified and deploy the functions there. After deploying you have to switch back to your desired env

#### Deploy dev functions

```bash
npm run functions:dev
```

#### Deploy staging functions

```bash
npm run functions:staging
```

#### Deploy prod functions

```bash
npm run functions:prod
```

#### Deploy to all env

```bash
npm run functions:all
```
