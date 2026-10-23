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
