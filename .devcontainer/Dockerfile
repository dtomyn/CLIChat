# Lumen dev container: Node 24 LTS + the two AI CLIs Lumen drives + Microsoft Edge for the Playwright tests.
FROM mcr.microsoft.com/devcontainers/javascript-node:5-24-bookworm

# Engines Lumen launches (providers/claude-cli.js, providers/copilot-cli.js). Both update themselves after install.
RUN npm install -g @anthropic-ai/claude-code @github/copilot \
 && npm cache clean --force

# playwright.config.js uses channel "msedge". Edge only ships for x64 Linux; on arm64 hosts the e2e tests won't run.
# Keep the Playwright version in step with devDependencies in package.json.
RUN if [ "$(dpkg --print-architecture)" = "amd64" ]; then \
      npx -y playwright@1.65.0 install --with-deps msedge \
      && rm -rf /var/lib/apt/lists/* /root/.npm; \
    else echo "Skipping Microsoft Edge: not available for $(dpkg --print-architecture)"; fi

# Mount points for the named volumes in devcontainer.json. Creating them here, owned by "node",
# means the volumes start out writable by the container user.
RUN mkdir -p /home/node/.claude /home/node/.copilot /home/node/lumen-data \
 && chown -R node:node /home/node/.claude /home/node/.copilot /home/node/lumen-data
