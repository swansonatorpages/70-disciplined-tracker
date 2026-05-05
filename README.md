# 70 Disciplined — Jonathan's Challenge

A high-performance, offline-first Progressive Web App (PWA) for tracking the 70 Disciplined challenge.

## Deployment

This application is designed to be easily deployed to GitHub Pages as a Progressive Web App (PWA).

### How to Deploy Your Own Tracker
1. **Fork this repository** to your own GitHub account.
2. Ensure your repository name is `70-disciplined-tracker` (or update the paths in the instructions if different).
3. **Enable GitHub Pages**:
   - Go to your repository's **Settings** > **Pages**.
   - Under **Build and deployment**, set the **Source** to **Deploy from a branch**.
   - *Note: The deployment action will automatically create the `gh-pages` branch for you. Once the first deploy finishes, come back here and select the `gh-pages` branch and `/ (root)` folder, then click **Save**.*
4. The deployment will happen automatically whenever you push to the `main` branch, thanks to the included GitHub Actions workflow.

### Automated Deployment Workflows
- **Deploy on Push**: The `.github/workflows/deploy.yml` action automatically publishes the contents of the `main` branch to the `gh-pages` branch.
- **Expected URL**: Once deployed, your PWA will be accessible at: `https://[your-github-username].github.io/70-disciplined-tracker/`
