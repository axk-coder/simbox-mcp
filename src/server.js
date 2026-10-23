import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { SimBoxBridge } from "./bridge.js";

const bridge = new SimBoxBridge();
bridge.start();

const server = new Server(
  {
    name: "simbox-mcp",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {
        listChanged: true
      }
    }
  }
);

bridge.onStatusChange(() => {
  try {
    server.notification({
      method: "notifications/tools/list_changed"
    });
  } catch (_) {}
});

const BUILDER_PREAMBLE = `
  const g = window.grid;
  const E = window.ELEMENTS;
  if (!g || !E) throw new Error("Grid or ELEMENTS not available");

  let placedCount = 0;
  const safeGetElem = (key, fallback = "stone") => {
    if (typeof key === "object" && key !== null) return key;
    if (typeof key === "string" && E[key]) return E[key];
    if (typeof fallback === "string" && E[fallback]) return E[fallback];
    return E.empty || Object.values(E)[0];
  };

  const builder = {
    cols: g.cols,
    rows: g.rows,
    grid: g,
    elements: E,
    get placed() { return placedCount; },
    set(x, y, key, overrides = {}) {
      const ix = Math.floor(Number(x));
      const iy = Math.floor(Number(y));
      if (!Number.isFinite(ix) || !Number.isFinite(iy) || !g.isInside(ix, iy)) return false;
      const el = safeGetElem(key, "stone");
      g.set(ix, iy, el, overrides);
      placedCount++;
      return true;
    },
    get(x, y) {
      return g.get(Math.floor(Number(x)), Math.floor(Number(y)));
    },
    rect(x1, y1, x2, y2, key, overrides = {}) {
      const nx1 = Math.floor(Number(x1));
      const ny1 = Math.floor(Number(y1));
      const nx2 = Math.floor(Number(x2));
      const ny2 = Math.floor(Number(y2));
      if (!Number.isFinite(nx1) || !Number.isFinite(ny1) || !Number.isFinite(nx2) || !Number.isFinite(ny2)) return;
      const minX = Math.max(0, Math.min(nx1, nx2));
      const maxX = Math.min(g.cols - 1, Math.max(nx1, nx2));
      const minY = Math.max(0, Math.min(ny1, ny2));
      const maxY = Math.min(g.rows - 1, Math.max(ny1, ny2));
      const el = safeGetElem(key, "stone");
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          g.set(x, y, el, overrides);
          placedCount++;
        }
      }
    },
    hollowRect(x1, y1, x2, y2, key, thickness = 1, fillKey = null) {
      const nx1 = Math.floor(Number(x1));
      const ny1 = Math.floor(Number(y1));
      const nx2 = Math.floor(Number(x2));
      const ny2 = Math.floor(Number(y2));
      if (!Number.isFinite(nx1) || !Number.isFinite(ny1) || !Number.isFinite(nx2) || !Number.isFinite(ny2)) return;
      const minX = Math.max(0, Math.min(nx1, nx2));
      const maxX = Math.min(g.cols - 1, Math.max(nx1, nx2));
      const minY = Math.max(0, Math.min(ny1, ny2));
      const maxY = Math.min(g.rows - 1, Math.max(ny1, ny2));
      const wallEl = safeGetElem(key, "stone");
      const fillEl = fillKey ? safeGetElem(fillKey, "empty") : null;
      const t = Math.max(1, Math.min(g.cols, Math.floor(Number(thickness))));
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const isBorder = (x < minX + t || x > maxX - t || y < minY + t || y > maxY - t);
          if (isBorder) {
            g.set(x, y, wallEl);
            placedCount++;
          } else if (fillEl) {
            g.set(x, y, fillEl);
            placedCount++;
          }
        }
      }
    },
    line(x1, y1, x2, y2, key) {
      let x = Math.floor(Number(x1));
      let y = Math.floor(Number(y1));
      const destX = Math.floor(Number(x2));
      const destY = Math.floor(Number(y2));
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(destX) || !Number.isFinite(destY)) return;
      const dx = Math.abs(destX - x);
      const dy = Math.abs(destY - y);
      const sx = x < destX ? 1 : -1;
      const sy = y < destY ? 1 : -1;
      let err = dx - dy;
      const el = safeGetElem(key, "stone");
      let limit = (g.cols + g.rows) * 4;
      while (limit-- > 0) {
        if (g.isInside(x, y)) {
          g.set(x, y, el);
          placedCount++;
        }
        if (x === destX && y === destY) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
    },
    circle(cx, cy, radius, key, filled = true) {
      const icx = Math.floor(Number(cx));
      const icy = Math.floor(Number(cy));
      const maxR = Math.max(g.cols, g.rows);
      const ir = Math.max(0, Math.min(maxR, Math.floor(Number(radius))));
      if (!Number.isFinite(icx) || !Number.isFinite(icy)) return;
      const el = safeGetElem(key, "stone");
      for (let x = -ir; x <= ir; x++) {
        for (let y = -ir; y <= ir; y++) {
          const distSq = x * x + y * y;
          if (filled ? (distSq <= ir * ir) : (distSq <= ir * ir && distSq >= (ir - 1) * (ir - 1))) {
            const px = icx + x;
            const py = icy + y;
            if (g.isInside(px, py)) {
              g.set(px, py, el);
              placedCount++;
            }
          }
        }
      }
    },
    house(startX, startY, w = 24, h = 18, opts = {}) {
      const width = Math.max(8, Math.min(g.cols, Math.floor(Number(w))));
      const height = Math.max(8, Math.min(g.rows, Math.floor(Number(h))));
      const x1 = Math.floor(Number(startX));
      const y2 = Math.floor(Number(startY));
      const x2 = x1 + width - 1;
      const wallH = Math.floor(height * 0.65);
      const roofH = height - wallH;
      const y1 = y2 - wallH + 1;
      const wallEl = opts.wall || "wood";
      const roofEl = opts.roof || "brick";
      const windowEl = opts.window || "glass";
      const floorEl = opts.floor || "stone";

      this.rect(x1, y2, x2, y2, floorEl);
      this.hollowRect(x1, y1, x2, y2 - 1, wallEl, 1, "empty");

      const doorW = 2;
      const doorH = 3;
      const doorX = Math.floor(x1 + width / 2 - doorW / 2);
      this.rect(doorX, y2 - doorH, doorX + doorW - 1, y2 - 1, "empty");

      const winY = y1 + Math.floor(wallH / 3);
      if (width >= 12) {
        this.rect(x1 + 2, winY, x1 + 3, winY + 1, windowEl);
        this.rect(x2 - 4, winY, x2 - 3, winY + 1, windowEl);
      }

      const peakX = Math.floor(x1 + width / 2);
      for (let i = 0; i <= roofH; i++) {
        const ry = y1 - i;
        const span = Math.floor((width / 2) * (1 - i / Math.max(1, roofH)));
        this.rect(peakX - span, ry, peakX + span, ry, roofEl);
      }
    },
    box(startX, startY, w, h, opts = {}) {
      const width = Math.max(3, Math.min(g.cols, Math.floor(Number(w))));
      const height = Math.max(3, Math.min(g.rows, Math.floor(Number(h))));
      const x1 = Math.floor(Number(startX));
      const y2 = Math.floor(Number(startY));
      const x2 = x1 + width - 1;
      const y1 = y2 - height + 1;
      const wallEl = opts.wall || "stone";
      const fillEl = opts.fill !== undefined ? opts.fill : "empty";
      const t = Math.max(1, Math.min(width, Math.floor(Number(opts.thickness || 1))));
      this.hollowRect(x1, y1, x2, y2, wallEl, t, fillEl);
    },
    tower(startX, startY, w = 12, h = 30, opts = {}) {
      const width = Math.max(6, Math.min(g.cols, Math.floor(Number(w))));
      const height = Math.max(10, Math.min(g.rows, Math.floor(Number(h))));
      const x1 = Math.floor(Number(startX));
      const y2 = Math.floor(Number(startY));
      const x2 = x1 + width - 1;
      const y1 = y2 - height + 1;
      const wallEl = opts.wall || "stone";
      const floorEl = opts.floor || "wood";
      const windowEl = opts.window || "glass";

      this.hollowRect(x1, y1, x2, y2, wallEl, 1, "empty");

      const floors = Math.floor(height / 6);
      for (let f = 1; f < floors; f++) {
        const fy = y2 - f * 6;
        this.rect(x1 + 1, fy, x2 - 1, fy, floorEl);
        const winY = fy + 2;
        if (winY < y2 - 1) {
          this.rect(x1 + Math.floor(width / 2) - 1, winY, x1 + Math.floor(width / 2), winY, windowEl);
        }
      }

      for (let bx = x1; bx <= x2; bx += 2) {
        this.set(bx, y1 - 1, wallEl);
      }
    },
    pyramid(startX, startY, w = 31, opts = {}) {
      const width = Math.max(5, Math.min(g.cols, Math.floor(Number(w))));
      const x1 = Math.floor(Number(startX));
      const yBase = Math.floor(Number(startY));
      const steps = Math.floor(width / 2);
      const el = opts.material || "sandstone";
      for (let s = 0; s <= steps; s++) {
        const ly = yBase - s;
        this.rect(x1 + s, ly, x1 + width - 1 - s, ly, el);
      }
    }
  };
`;

const ALL_TOOLS = [
  {
    name: "simbox_status",
    description: "Check if SimBox 2.0 is open in the browser and get status",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "simbox_run_builder_script",
    description: "Execute a procedural construction script with the builder API helper (build houses, shapes, mazes, tanks, towers)",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "JavaScript construction code with builder API (builder.rect, builder.line, builder.circle, builder.house, builder.box, builder.tower, builder.pyramid, builder.set)"
        }
      },
      required: ["code"]
    }
  },
  {
    name: "simbox_build_structure",
    description: "Quickly build structural presets (house, tower, box/tank, pyramid) with custom dimensions and materials",
    inputSchema: {
      type: "object",
      properties: {
        structure: {
          type: "string",
          enum: ["house", "tower", "box", "pyramid"],
          description: "Type of structure to generate"
        },
        x: { type: "number", description: "Start X coordinate" },
        y: { type: "number", description: "Base Y coordinate (bottom)" },
        width: { type: "number", description: "Width in cells" },
        height: { type: "number", description: "Height in cells" },
        materials: {
          type: "object",
          description: "Material element keys e.g. { wall: 'wood', roof: 'brick', floor: 'stone', window: 'glass', fill: 'water' }"
        }
      },
      required: ["structure", "x", "y"]
    }
  },
  {
    name: "simbox_get_elements",
    description: "Get list of available elements in SimBox with categories and properties",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Optional category filter"
        },
        search: {
          type: "string",
          description: "Optional search query"
        }
      }
    }
  },
  {
    name: "simbox_set_element",
    description: "Define and register a custom element in SimBox",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Display name of the element"
        },
        color: {
          type: "string",
          description: "CSS color hex or rgb"
        },
        category: {
          type: "string",
          description: "Sidebar category e.g. Solids, Liquids, Powders, Gases, Explosive, Custom"
        },
        properties: {
          type: "object",
          description: "Element properties (density, conductivity, flammable, temperature, tags, variants)"
        },
        behaviorCode: {
          type: "string",
          description: "JavaScript body of (grid, x, y) => { ... } running every tick"
        },
        onplaceCode: {
          type: "string",
          description: "JavaScript body of (grid, x, y) => { ... } running on place"
        }
      },
      required: ["name", "color", "category"]
    }
  },
  {
    name: "simbox_grid_get",
    description: "Get cell data at coordinates (x, y)",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number", description: "X coordinate" },
        y: { type: "number", description: "Y coordinate" }
      },
      required: ["x", "y"]
    }
  },
  {
    name: "simbox_grid_set",
    description: "Set a cell at coordinates (x, y) to an element",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number", description: "X coordinate" },
        y: { type: "number", description: "Y coordinate" },
        elementKey: { type: "string", description: "Element key in ELEMENTS e.g. sand, fire, acid" },
        overrides: { type: "object", description: "Cell field overrides e.g. { temperature: 300 }" }
      },
      required: ["x", "y", "elementKey"]
    }
  },
  {
    name: "simbox_grid_fill",
    description: "Fill a rectangle on the grid with an element",
    inputSchema: {
      type: "object",
      properties: {
        x1: { type: "number", description: "Start X" },
        y1: { type: "number", description: "Start Y" },
        x2: { type: "number", description: "End X" },
        y2: { type: "number", description: "End Y" },
        elementKey: { type: "string", description: "Element key in ELEMENTS" }
      },
      required: ["x1", "y1", "x2", "y2", "elementKey"]
    }
  },
  {
    name: "simbox_clear_grid",
    description: "Clear the simulation grid with empty element",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "simbox_load_mod",
    description: "Load and execute custom mod JavaScript in SimBox",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Mod name" },
        version: { type: "string", description: "Mod version" },
        code: { type: "string", description: "Mod JavaScript code" }
      },
      required: ["name", "code"]
    }
  },
  {
    name: "simbox_list_mods",
    description: "List all installed and active mods in SimBox",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "simbox_toggle_mod",
    description: "Toggle or enable/disable a mod by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Mod ID" },
        action: {
          type: "string",
          enum: ["enable", "disable", "toggle"],
          description: "Action to perform"
        }
      },
      required: ["id"]
    }
  },
  {
    name: "simbox_eval_script",
    description: "Run custom JavaScript code directly in the SimBox page context",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript code string to evaluate" }
      },
      required: ["code"]
    }
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const isConnected = bridge.isConnected();
  if (isConnected) {
    return { tools: ALL_TOOLS };
  }
  return {
    tools: [
      {
        name: "simbox_status",
        description: "Check SimBox connection status (https://guttobear.github.io/simbox2.0/ is currently not open)",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "simbox_status") {
    const connected = bridge.isConnected();
    if (!connected) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                connected: false,
                message: "SimBox 2.0 is not currently connected.",
                targetUrl: "https://guttobear.github.io/simbox2.0/",
                instruction:
                  "Open https://guttobear.github.io/simbox2.0/ with the SimBox extension, userscript, or bookmarklet active."
              },
              null,
              2
            )
          }
        ]
      };
    }

    try {
      const status = await bridge.evalScript(`
        const list = Object.keys(window.ELEMENTS || {});
        const mods = window.modManager && window.modManager.mods ? Array.from(window.modManager.mods.values()).map(m => ({ id: m.id, name: m.name, enabled: m.enabled })) : [];
        return {
          connected: true,
          cols: window.grid ? window.grid.cols : null,
          rows: window.grid ? window.grid.rows : null,
          totalElements: list.length,
          modsCount: mods.length,
          mods: mods,
          selectedElement: window.selectedElement ? window.selectedElement.name : null,
          currentCategory: window.currentCategory || null
        };
      `);
      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Error fetching status: " + err.message }]
      };
    }
  }

  if (!bridge.isConnected()) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "SimBox 2.0 is not open or connected at https://guttobear.github.io/simbox2.0/"
        }
      ]
    };
  }

  if (name === "simbox_run_builder_script") {
    try {
      const userCode = args?.code;
      if (!userCode || typeof userCode !== "string") {
        throw new Error("Missing or invalid script code");
      }
      const wrappedScript = `
        ${BUILDER_PREAMBLE}
        const userFn = new Function("builder", "grid", "ELEMENTS", "Element", ${JSON.stringify(userCode)});
        userFn(builder, window.grid, window.ELEMENTS, window.Element);
        return {
          success: true,
          placedCells: builder.placed
        };
      `;
      const result = await bridge.evalScript(wrappedScript);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Builder script error: " + err.message }]
      };
    }
  }

  if (name === "simbox_build_structure") {
    try {
      const structType = args?.structure;
      const x = Math.floor(Number(args?.x));
      const y = Math.floor(Number(args?.y));
      const width = Math.max(1, Math.min(500, args?.width !== undefined ? Math.floor(Number(args.width)) : 24));
      const height = Math.max(1, Math.min(500, args?.height !== undefined ? Math.floor(Number(args.height)) : 18));
      const cleanMaterials = {};
      if (typeof args?.materials === "object" && args.materials !== null) {
        for (const k of Object.keys(args.materials)) {
          if (!["__proto__", "constructor", "prototype"].includes(k)) {
            cleanMaterials[k] = String(args.materials[k]);
          }
        }
      }

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error("Invalid coordinate parameters");
      }

      const script = `
        ${BUILDER_PREAMBLE}
        const type = ${JSON.stringify(structType)};
        const opts = ${JSON.stringify(cleanMaterials)};
        if (type === "house") {
          builder.house(${x}, ${y}, ${width}, ${height}, opts);
        } else if (type === "tower") {
          builder.tower(${x}, ${y}, ${width}, ${height}, opts);
        } else if (type === "box") {
          builder.box(${x}, ${y}, ${width}, ${height}, opts);
        } else if (type === "pyramid") {
          builder.pyramid(${x}, ${y}, ${width}, opts);
        } else {
          throw new Error("Unknown structure type: " + type);
        }
        return {
          success: true,
          structure: type,
          x: ${x},
          y: ${y},
          placedCells: builder.placed
        };
      `;
      const result = await bridge.evalScript(script);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Failed to build structure: " + err.message }]
      };
    }
  }

  if (name === "simbox_get_elements") {
    try {
      const categoryFilter = typeof args?.category === "string" ? args.category : "";
      const searchQuery = typeof args?.search === "string" ? args.search.toLowerCase() : "";
      const script = `
        const result = {};
        const filterCat = ${JSON.stringify(categoryFilter)};
        const query = ${JSON.stringify(searchQuery)};
        for (const key in window.ELEMENTS) {
          const el = window.ELEMENTS[key];
          if (!el) continue;
          if (filterCat && el.category !== filterCat) continue;
          if (query && !key.toLowerCase().includes(query) && !(el.name && el.name.toLowerCase().includes(query))) continue;
          result[key] = {
            name: el.name,
            category: el.category,
            color: el.color,
            density: el.density,
            conductivity: el.conductivity,
            flammable: el.flammable,
            temperature: el.temperature,
            hidden: el.hidden,
            tags: el.tags,
            variants: el.variants ? Object.keys(el.variants) : []
          };
        }
        return result;
      `;
      const data = await bridge.evalScript(script);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Failed to get elements: " + err.message }]
      };
    }
  }

  if (name === "simbox_set_element") {
    try {
      const { name: elName, color, category, properties, behaviorCode, onplaceCode } = args;
      if (!elName || typeof elName !== "string") {
        throw new Error("Invalid element name");
      }
      let key = elName.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      if (!key || ["__proto__", "constructor", "prototype"].includes(key)) {
        key = "el_" + Date.now();
      }
      const script = `
        const key = ${JSON.stringify(key)};
        const name = ${JSON.stringify(elName)};
        const color = ${JSON.stringify(color)};
        const category = ${JSON.stringify(category)};
        const props = ${JSON.stringify(properties || {})};
        let behavior = () => {};
        let onplace = () => {};
        if (${JSON.stringify(behaviorCode || "")}) {
          behavior = new Function("grid", "x", "y", ${JSON.stringify(behaviorCode || "")});
        }
        if (${JSON.stringify(onplaceCode || "")}) {
          onplace = new Function("grid", "x", "y", ${JSON.stringify(onplaceCode || "")});
        }
        const newElem = new window.Element(name, color, category, props, behavior, onplace);
        window.ELEMENTS[key] = newElem;
        if (typeof window.updateElementButtons === "function") {
          window.updateElementButtons();
        }
        if (typeof window.updateCategoryButtons === "function") {
          window.updateCategoryButtons();
        }
        return { success: true, key: key, name: name, category: category };
      `;
      const result = await bridge.evalScript(script);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Failed to set element: " + err.message }]
      };
    }
  }

  if (name === "simbox_grid_get") {
    try {
      const x = Math.floor(Number(args.x));
      const y = Math.floor(Number(args.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error("Invalid coordinates");
      }
      const script = `
        const cell = window.grid.get(${x}, ${y});
        if (!cell) return null;
        return {
          element: cell.element ? cell.element.name : null,
          temperature: cell.temperature,
          age: cell.age,
          color: cell.color,
          burning: cell.burning || false
        };
      `;
      const data = await bridge.evalScript(script);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Failed to get grid cell: " + err.message }]
      };
    }
  }

  if (name === "simbox_grid_set") {
    try {
      const x = Math.floor(Number(args.x));
      const y = Math.floor(Number(args.y));
      const { elementKey, overrides } = args;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error("Invalid coordinates");
      }
      const script = `
        const el = window.ELEMENTS[${JSON.stringify(elementKey)}];
        if (!el) {
          throw new Error("Element " + ${JSON.stringify(elementKey)} + " not found in ELEMENTS");
        }
        window.grid.set(${x}, ${y}, el, ${JSON.stringify(overrides || {})});
        return { success: true, x: ${x}, y: ${y}, element: el.name };
      `;
      const data = await bridge.evalScript(script);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Failed to set grid cell: " + err.message }]
      };
    }
  }

  if (name === "simbox_grid_fill") {
    try {
      const x1 = Math.floor(Number(args.x1));
      const y1 = Math.floor(Number(args.y1));
      const x2 = Math.floor(Number(args.x2));
      const y2 = Math.floor(Number(args.y2));
      const { elementKey } = args;
      if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
        throw new Error("Invalid coordinates");
      }
      const script = `
        const el = window.ELEMENTS[${JSON.stringify(elementKey)}];
        if (!el) {
          throw new Error("Element " + ${JSON.stringify(elementKey)} + " not found in ELEMENTS");
        }
        window.grid.fill(${x1}, ${y1}, ${x2}, ${y2}, el);
        return { success: true, fillArea: [${x1}, ${y1}, ${x2}, ${y2}], element: el.name };
      `;
      const data = await bridge.evalScript(script);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Failed to fill grid: " + err.message }]
      };
    }
  }

  if (name === "simbox_clear_grid") {
    try {
      const script = `
        if (!window.grid || !window.ELEMENTS || !window.ELEMENTS.empty) {
          throw new Error("Grid or empty element not available");
        }
        window.grid.fill(0, 0, window.grid.cols - 1, window.grid.rows - 1, window.ELEMENTS.empty);
        return { success: true, message: "Grid cleared" };
      `;
      const data = await bridge.evalScript(script);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Failed to clear grid: " + err.message }]
      };
    }
  }

  if (name === "simbox_load_mod") {
    try {
      const { name: modName, version, code } = args;
      if (!modName || !code) {
        throw new Error("Missing mod name or code");
      }
      const script = `
        const modCode = ${JSON.stringify(code)};
        const modName = ${JSON.stringify(modName)};
        const modVersion = ${JSON.stringify(version || "1.0.0")};
        let registeredMod = null;
        const registerMod = (data) => {
          registeredMod = data;
        };
        const fn = new Function("registerMod", "ModManager", modCode);
        fn(registerMod, window.modManager);
        if (registeredMod && typeof registeredMod.init === "function") {
          registeredMod.init();
        }
        if (window.modManager && typeof window.modManager.generateId === "function") {
          const id = window.modManager.generateId(modName);
          const modObj = {
            id: id,
            name: modName,
            version: modVersion,
            fileName: modName + ".js",
            code: modCode,
            enabled: true,
            instance: registeredMod
          };
          window.modManager.mods.set(id, modObj);
          if (typeof window.modManager.saveMods === "function") {
            window.modManager.saveMods();
          }
        }
        if (typeof window.updateElementButtons === "function") {
          window.updateElementButtons();
        }
        if (typeof window.updateCategoryButtons === "function") {
          window.updateCategoryButtons();
        }
        return { success: true, modName: modName, version: modVersion };
      `;
      const data = await bridge.evalScript(script);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Failed to load mod: " + err.message }]
      };
    }
  }

  if (name === "simbox_list_mods") {
    try {
      const script = `
        if (!window.modManager || !window.modManager.mods) {
          return [];
        }
        return Array.from(window.modManager.mods.values()).map(m => ({
          id: m.id,
          name: m.name,
          version: m.version,
          enabled: m.enabled
        }));
      `;
      const data = await bridge.evalScript(script);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Failed to list mods: " + err.message }]
      };
    }
  }

  if (name === "simbox_toggle_mod") {
    try {
      const { id, action } = args;
      if (!id) {
        throw new Error("Missing mod ID");
      }
      const script = `
        if (!window.modManager) {
          throw new Error("ModManager is not available");
        }
        const targetId = ${JSON.stringify(id)};
        const act = ${JSON.stringify(action || "toggle")};
        let status = false;
        if (act === "enable") {
          status = window.modManager.enableMod(targetId);
        } else if (act === "disable") {
          status = window.modManager.disableMod(targetId);
        } else {
          status = window.modManager.toggleMod(targetId);
        }
        return { id: targetId, action: act, success: status };
      `;
      const data = await bridge.evalScript(script);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Failed to toggle mod: " + err.message }]
      };
    }
  }

  if (name === "simbox_eval_script") {
    try {
      const { code } = args;
      if (!code) {
        throw new Error("Missing script code");
      }
      const data = await bridge.evalScript(code);
      return {
        content: [{ type: "text", text: typeof data === "object" ? JSON.stringify(data, null, 2) : String(data) }]
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: "Evaluation error: " + err.message }]
      };
    }
  }

  return {
    isError: true,
    content: [{ type: "text", text: "Unknown tool: " + name }]
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal server error:", err);
  process.exit(1);
});
