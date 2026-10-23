# SimBox MCP Server

Model Context Protocol (MCP) server that hooks into browser sessions running SimBox 2.0 (https://guttobear.github.io/simbox2.0/) and exposes tools for the SimBox modding API and programmatic builder scripts.

## Requirements

- Node.js 18 or newer
- SimBox 2.0 running in browser

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Claude Desktop or Antigravity:

Add to your MCP settings configuration (`claude_desktop_config.json` or Antigravity `mcp_settings.json`):

```json
{
  "mcpServers": {
    "simbox": {
      "command": "node",
      "args": ["/home/akidin/simbox-mcp/src/server.js"]
    }
  }
}
```

## Hooking the Browser

Choose any of the following methods to hook into SimBox:

### Option 1: Chrome Extension
1. Open Chrome and go to `chrome://extensions/`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the `/home/akidin/simbox-mcp/client/extension` folder.
4. Open `https://guttobear.github.io/simbox2.0/`. The indicator at the bottom right will show "MCP: Connected".

### Option 2: Userscript (Tampermonkey / Violentmonkey)
1. Install Tampermonkey or Violentmonkey.
2. Create a new script and paste the contents of `/home/akidin/simbox-mcp/client/simbox-hook.user.js`.
3. Save and open `https://guttobear.github.io/simbox2.0/`.

### Option 3: Bookmarklet / DevTools Console
1. Open `https://guttobear.github.io/simbox2.0/`.
2. Open DevTools (F12) Console.
3. Paste the code from `/home/akidin/simbox-mcp/client/bookmarklet.js` and press Enter.

### Option 4: Chrome Remote Debugging (CDP)
Start Chrome with remote debugging:
```bash
google-chrome --remote-debugging-port=9222 https://guttobear.github.io/simbox2.0/
```

## Available Tools

When SimBox is open, the following tools are exposed:

### Construction & Temp Scripts
- `simbox_run_builder_script`: Run temporary procedural construction scripts with the built-in `builder` API:
  - `builder.house(x, y, width, height, { wall, roof, window, floor })`
  - `builder.tower(x, y, width, height, { wall, floor, window })`
  - `builder.box(x, y, width, height, { wall, fill, thickness })`
  - `builder.pyramid(x, y, width, { material })`
  - `builder.rect(x1, y1, x2, y2, elementKey, overrides)`
  - `builder.hollowRect(x1, y1, x2, y2, elementKey, thickness, fillKey)`
  - `builder.line(x1, y1, x2, y2, elementKey)`
  - `builder.circle(cx, cy, radius, elementKey, filled)`
  - `builder.set(x, y, elementKey, overrides)`
- `simbox_build_structure`: Build structure presets (house, tower, box/tank, pyramid) with custom dimensions and material mappings.

### Engine & Modding Tools
- `simbox_status`: Connection state, grid dimensions, active mods, elements count.
- `simbox_get_elements`: Inspect registered elements, categories, properties (density, flammable, etc.).
- `simbox_set_element`: Register a custom element with behavior and onplace routines.
- `simbox_grid_get`: Read cell state at coordinates (x, y).
- `simbox_grid_set`: Place an element at coordinates (x, y) with optional temperature/property overrides.
- `simbox_grid_fill`: Fill a bounding box with an element.
- `simbox_clear_grid`: Reset the simulation grid.
- `simbox_load_mod`: Install and run custom mod JavaScript code.
- `simbox_list_mods`: List installed and active mods.
- `simbox_toggle_mod`: Toggle, enable, or disable mods.
- `simbox_eval_script`: Execute custom JavaScript directly in the SimBox page context.

## Credits

- SimBox 2.0 game and modding engine created by Guttobear (https://guttobear.github.io/simbox2.0/).
- SimBox Modding API documentation and reference by the SimBox project team.

## Terms and Privacy Policy

This software operates locally on your machine over local loopback interfaces (127.0.0.1) and does not collect, transmit, or store private personal data on external servers. Usage is intended for modding and sandbox experimentation on SimBox 2.0.
