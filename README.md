# PM Dashboard Chrome Extension

A sleek, modern Chrome extension dashboard that integrates **Linear** and **Everhour** to provide a concise overview of your projects, budgets, and unread notifications.

## Features

- **Linear Inbox**: View your latest notifications (Mentions, Assignments, etc.) directly in the dashboard.
  - Clicking a notification opens the issue directly in Linear.
  - Notifications are highlighted based on read/unread status.
- **Project Budgets**: Track Everhour project budgets in real-time.
  - Budget consumption is displayed in **Euro (€)** with standard European formatting.
  - Visual indicators (colors) for budget progress.
- **Minimalist Design**: A glassmorphism-inspired UI designed for focus and clarity.
- **Easy Setup**: Simple configuration via a settings modal for API keys.

## Tech Stack

- **HTML5/CSS3**: Vanilla implementation for maximum performance.
- **JavaScript (ES6+)**: Asynchronous API fetching and dynamic DOM rendering.
- **GraphQL**: Used for efficient data fetching from the Linear API.
- **Chrome Extension API**: Local storage for secure key management.

## Setup Instructions

1.  **Install the Extension**:
    - Open Chrome and go to `chrome://extensions/`.
    - Enable "Developer mode" (toggle in the top right).
    - Click "Load unpacked" and select the project directory.
2.  **Configuration**:
    - Open a new tab to see the dashboard.
    - Click the **Settings (gear)** icon.
    - Enter your **Linear API Key** and **Everhour API Key**.
    - Save the configuration.
3.  **Authentication**:
    - Ensure your API keys have sufficient permissions (read access for notifications, projects, and budgets).

## Development

To modify the dashboard:
- `api.js`: Handles all external API requests and GraphQL queries.
- `script.js`: Manages dashboard logic, rendering, and event listeners.
- `styles.css`: Contains the glassmorphism design system and layout.
- `newtab.html`: The main structural template.

## License
MIT
