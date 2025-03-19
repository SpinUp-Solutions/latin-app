// Function to determine the current environment based on the project ID
export const getEnvironment = (): string => {
  const projectId = process.env.GCLOUD_PROJECT || '';

  if (projectId.includes('latin-app-prod')) {
    return 'production';
  } else if (projectId.includes('latin-app-staging')) {
    return 'staging';
  } else {
    return 'development';
  }
};
