/**
 * @typedef MetaTagDefinition
 * @property {('link'|'meta')} tag - the type of meta tag element
 * @property {{string:string}|null} props - the inner key/values of a meta tag
 * @property {string|null} content - Text content to be injected between tags. If null self-closing.
 */

// [base-path] All hardcoded absolute paths in this file (favicon, manifest,
// index.js/css, PWA start_url, ...) need to be prefixed with BASE_PATH so they
// resolve correctly when AnythingLLM is mounted under a sub-path.
const { BASE_PATH, joinBase } = require("../basePath");

// [base-path] PWA start_url convention is to include a trailing slash so
// installed apps open at the SPA root (e.g. "/ia/"), matching the redirect
// installed in server/index.js. Falls back to "/" when no BASE_PATH is set.
const PWA_START_URL = BASE_PATH ? `${BASE_PATH}/` : "/";

/**
 * This class serves the default index.html page that is not present when built in production.
 * and therefore this class should not be called when in development mode since it is unused.
 * All this class does is basically emulate SSR for the meta-tag generation of the root index page.
 * Since we are an SPA, we can just render the primary page and the known entrypoints for the index.{js,css}
 * we can always start at the right place and dynamically load in lazy-loaded as we typically normally would
 * and we dont have any of the overhead that would normally come with having the rewrite the whole app in next or something.
 * Lastly, this class is singleton, so once instantiate the same reference is shared for as long as the server is alive.
 * the main function is `.generate()` which will return the index HTML. These settings are stored in the #customConfig
 * static property and will not be reloaded until the page is loaded AND #customConfig is explicitly null. So anytime a setting
 * for meta-props is updated you should get this singleton class and call `.clearConfig` so the next page load will show the new props.
 */
class MetaGenerator {
  name = "MetaGenerator";

  /** @type {MetaGenerator|null} */
  static _instance = null;

  /** @type {MetaTagDefinition[]|null} */
  #customConfig = null;

  // [base-path] Default manifest used as a fallback when DB read fails.
  // start_url and the favicon src must include BASE_PATH so the installed
  // PWA opens at "/ia/" instead of the domain root.
  #defaultManifest = {
    name: "AnythingLLM",
    short_name: "AnythingLLM",
    display: "standalone",
    orientation: "portrait",
    start_url: PWA_START_URL,
    icons: [
      {
        src: joinBase("/favicon.png"),
        sizes: "any",
      },
    ],
  };

  constructor() {
    if (MetaGenerator._instance) return MetaGenerator._instance;
    MetaGenerator._instance = this;
  }

  #log(text, ...args) {
    console.log(`\x1b[36m[${this.name}]\x1b[0m ${text}`, ...args);
  }

  #defaultMeta() {
    // [base-path] Internal asset paths (/favicon.png, /manifest.json) below
    // are wrapped with joinBase() so they resolve under BASE_PATH at runtime.
    return [
      {
        tag: "link",
        props: { type: "image/svg+xml", href: joinBase("/favicon.png") },
        content: null,
      },
      {
        tag: "title",
        props: null,
        content: "AnythingLLM | Your personal LLM trained on anything",
      },

      {
        tag: "meta",
        props: {
          name: "title",
          content: "AnythingLLM | Your personal LLM trained on anything",
        },
      },
      {
        tag: "meta",
        props: {
          description: "title",
          content: "AnythingLLM | Your personal LLM trained on anything",
        },
      },

      // <!-- Facebook -->
      { tag: "meta", props: { property: "og:type", content: "website" } },
      {
        tag: "meta",
        props: { property: "og:url", content: "https://anythingllm.com" },
      },
      {
        tag: "meta",
        props: {
          property: "og:title",
          content: "AnythingLLM | Your personal LLM trained on anything",
        },
      },
      {
        tag: "meta",
        props: {
          property: "og:description",
          content: "AnythingLLM | Your personal LLM trained on anything",
        },
      },
      {
        tag: "meta",
        props: {
          property: "og:image",
          content:
            "https://raw.githubusercontent.com/Mintplex-Labs/anything-llm/master/images/promo.png",
        },
      },

      // <!-- Twitter -->
      {
        tag: "meta",
        props: { property: "twitter:card", content: "summary_large_image" },
      },
      {
        tag: "meta",
        props: { property: "twitter:url", content: "https://anythingllm.com" },
      },
      {
        tag: "meta",
        props: {
          property: "twitter:title",
          content: "AnythingLLM | Your personal LLM trained on anything",
        },
      },
      {
        tag: "meta",
        props: {
          property: "twitter:description",
          content: "AnythingLLM | Your personal LLM trained on anything",
        },
      },
      {
        tag: "meta",
        props: {
          property: "twitter:image",
          content:
            "https://raw.githubusercontent.com/Mintplex-Labs/anything-llm/master/images/promo.png",
        },
      },

      { tag: "link", props: { rel: "icon", href: joinBase("/favicon.png") } },
      {
        tag: "link",
        props: { rel: "apple-touch-icon", href: joinBase("/favicon.png") },
      },

      // PWA specific tags
      {
        tag: "meta",
        props: { name: "mobile-web-app-capable", content: "yes" },
      },
      {
        tag: "meta",
        props: { name: "apple-mobile-web-app-capable", content: "yes" },
      },
      {
        tag: "meta",
        props: {
          name: "apple-mobile-web-app-status-bar-style",
          content: "black-translucent",
        },
      },
      {
        tag: "link",
        props: { rel: "manifest", href: joinBase("/manifest.json") },
      },
    ];
  }

  /**
   * Assembles Meta tags as one large string
   * @param {MetaTagDefinition[]} tagArray
   * @returns {string}
   */
  #assembleMeta() {
    const output = [];
    for (const tag of this.#customConfig) {
      let htmlString;
      htmlString = `<${tag.tag} `;

      if (tag.props !== null) {
        for (const [key, value] of Object.entries(tag.props))
          htmlString += `${key}="${value}" `;
      }

      if (tag.content) {
        htmlString += `>${tag.content}</${tag.tag}>`;
      } else {
        htmlString += `>`;
      }
      output.push(htmlString);
    }
    return output.join("\n");
  }

  #validUrl(faviconUrl = null) {
    // [base-path] Fallback to the local favicon under BASE_PATH so the icon
    // still loads when an admin clears or breaks the custom favicon URL.
    if (faviconUrl === null) return joinBase("/favicon.png");
    try {
      const url = new URL(faviconUrl);
      return url.toString();
    } catch {
      return joinBase("/favicon.png");
    }
  }

  async #fetchConfg() {
    this.#log(`fetching custom meta tag settings...`);
    const { SystemSettings } = require("../../models/systemSettings");
    const customTitle = await SystemSettings.getValueOrFallback(
      { label: "meta_page_title" },
      null
    );
    const faviconURL = await SystemSettings.getValueOrFallback(
      { label: "meta_page_favicon" },
      null
    );

    // If nothing defined - assume defaults.
    if (customTitle === null && faviconURL === null) {
      this.#customConfig = this.#defaultMeta();
    } else {
      // When custom settings exist, include all default meta tags but override specific ones
      this.#customConfig = this.#defaultMeta().map((tag) => {
        // Override favicon link
        if (tag.tag === "link" && tag.props?.rel === "icon") {
          return {
            tag: "link",
            props: { rel: "icon", href: this.#validUrl(faviconURL) },
          };
        }
        // Override page title
        if (tag.tag === "title") {
          return {
            tag: "title",
            props: null,
            content:
              customTitle ??
              "AnythingLLM | Your personal LLM trained on anything",
          };
        }
        // Override meta title
        if (tag.tag === "meta" && tag.props?.name === "title") {
          return {
            tag: "meta",
            props: {
              name: "title",
              content:
                customTitle ??
                "AnythingLLM | Your personal LLM trained on anything",
            },
          };
        }
        // Override og:title
        if (tag.tag === "meta" && tag.props?.property === "og:title") {
          return {
            tag: "meta",
            props: {
              property: "og:title",
              content:
                customTitle ??
                "AnythingLLM | Your personal LLM trained on anything",
            },
          };
        }
        // Override twitter:title
        if (tag.tag === "meta" && tag.props?.property === "twitter:title") {
          return {
            tag: "meta",
            props: {
              property: "twitter:title",
              content:
                customTitle ??
                "AnythingLLM | Your personal LLM trained on anything",
            },
          };
        }
        // Override apple-touch-icon if custom favicon is set
        if (
          tag.tag === "link" &&
          tag.props?.rel === "apple-touch-icon" &&
          faviconURL
        ) {
          return {
            tag: "link",
            props: {
              rel: "apple-touch-icon",
              href: this.#validUrl(faviconURL),
            },
          };
        }
        // Return original tag for everything else (including PWA tags)
        return tag;
      });
    }

    return this.#customConfig;
  }

  /**
   * Clears the current config so it can be refetched on the server for next render.
   */
  clearConfig() {
    this.#customConfig = null;
  }

  /**
   *
   * @param {import('express').Response} response
   * @param {number} code
   */
  async generate(response, code = 200) {
    if (this.#customConfig === null) await this.#fetchConfg();
    // [base-path] index.js/index.css are produced by Vite and copied into
    // server/public; with BASE_PATH set, express.static serves them at
    // "/ia/index.js" etc., so the references here MUST be prefixed.
    const indexJs = joinBase("/index.js");
    const indexCss = joinBase("/index.css");
    response.status(code).send(`
       <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            ${this.#assembleMeta()}
            <script type="module" crossorigin src="${indexJs}"></script>
            <link rel="stylesheet" href="${indexCss}">
          </head>
          <body>
            <div id="root" class="h-screen"></div>
          </body>
        </html>`);
  }

  /**
   * Generates the manifest.json file for the PWA application on the fly.
   * @param {import('express').Response} response
   * @param {number} code
   */
  async generateManifest(response) {
    try {
      const { SystemSettings } = require("../../models/systemSettings");
      const manifestName = await SystemSettings.getValueOrFallback(
        { label: "meta_page_title" },
        "AnythingLLM"
      );
      const faviconURL = await SystemSettings.getValueOrFallback(
        { label: "meta_page_favicon" },
        null
      );

      // [base-path] Fall back to the prefixed favicon path; only keep the
      // admin-provided URL untouched when it is a fully-qualified URL
      // (otherwise it would not resolve under the sub-path).
      let iconUrl = joinBase("/favicon.png");
      if (faviconURL) {
        try {
          new URL(faviconURL);
          iconUrl = faviconURL;
        } catch {
          iconUrl = joinBase("/favicon.png");
        }
      }

      const manifest = {
        name: manifestName,
        short_name: manifestName,
        display: "standalone",
        orientation: "portrait",
        // [base-path] PWA `start_url` controls where the installed app opens.
        // Without the prefix, an installed PWA would land on the domain root
        // and miss the AnythingLLM container entirely.
        start_url: PWA_START_URL,
        icons: [
          {
            src: iconUrl,
            sizes: "any",
          },
        ],
      };

      response.type("application/json").status(200).send(manifest).end();
    } catch (error) {
      this.#log(`error generating manifest: ${error.message}`, error);
      response
        .type("application/json")
        .status(200)
        .send(this.#defaultManifest)
        .end();
    }
  }
}

module.exports.MetaGenerator = MetaGenerator;
