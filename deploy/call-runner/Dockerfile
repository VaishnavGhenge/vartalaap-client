FROM mcr.microsoft.com/playwright:v1.59.1-noble
WORKDIR /app
RUN npm install --no-audit --no-fund @playwright/test@1.59.1
COPY playwright.config.ts ./
COPY e2e ./e2e
CMD ["timeout", "600", "npx", "playwright", "test", "call-capacity.spec.ts", "--reporter=line,json"]
