# SwiftAgent Widget

A standalone embeddable AI voice + chat widget built with React + Vite (IIFE bundle), designed to be dropped into any website via a single `<script>` tag.

## Usage

```html
<script
  src="https://yourdomain.com/widget-ui.js"
  data-company-id="YOUR_COMPANY_ID"
  defer
></script>
```

## Development

```bash
npm install
npm run build
```

Output: `dist/widget-ui.js` — a fully self-contained IIFE bundle with Shadow DOM style isolation.

## Tech

- React 19
- Vite (IIFE build)
- Tailwind CSS v4
- Shadow DOM for style encapsulation
