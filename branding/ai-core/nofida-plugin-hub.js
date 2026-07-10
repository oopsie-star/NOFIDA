/* ============================================================================
 * NOFIDA Plugin Hub
 * ---------------------------------------------------------------------------
 * Browsable catalog of Penpot-compatible plugins, shown at #/nofida/plugins.
 *
 * Unlike the Library Hub, plugins need NO vendoring/import pipeline: each one
 * is just a manifest.json hosted on its own origin. Penpot's own (untouched,
 * native) install flow already handles fetch-manifest + permission consent +
 * per-user persisted install — see frontend/src/app/main/ui/dashboard.cljs
 * `use-plugin-register` and app/plugins/register.cljs. That flow triggers
 * whenever the URL hash resolves to an empty path with a `plugin=` query
 * param (exactly how penpot.app/penpothub/plugins' own "Install" links work).
 * So "installing" from this catalog is just:
 *   window.location.hash = "?plugin=" + encodeURIComponent(manifestUrl);
 * No backend, no custom RPC, no file storage — fully native.
 *
 * Asset tag __NOFIDA_ASSET_TAG__ is replaced at image-build time by
 * branding/scripts/patch-frontend.sh.
 * ========================================================================== */
(function () {
  "use strict";

  if (window.NofidaPluginHub) return;

  var ASSET_TAG = "__NOFIDA_ASSET_TAG__";
  var HUB_HASH  = "#/nofida/plugins";

  var BRAND = {
    bg:           "#0c1018",
    surface:      "#161c28",
    surfaceHard:  "#12161f",
    border:       "rgba(94,126,166,.20)",
    primary:      "#5E7EA6",
    primaryHov:   "#6E8CB2",
    accent:       "#6BA98F",
    text:         "#e9edf3",
    muted:        "#8a93a3",
    success:      "#7CB79E",
    warning:      "#C9A468",
    error:        "#C97070",
    font:         'Montserrat,Inter,"Segoe UI",system-ui,sans-serif'
  };

  var CATEGORIES = [
    { id: "all",             label: "Все" },
    { id: "tools",            label: "Инструменты" },
    { id: "productivity",     label: "Продуктивность" },
    { id: "content",          label: "Контент" },
    { id: "developer",        label: "Разработка" },
    { id: "shapes",           label: "Формы" },
    { id: "design-system",    label: "Дизайн-системы" },
    { id: "patterns",         label: "Паттерны" },
    { id: "image-editing",    label: "Обработка изображений" },
    { id: "color",            label: "Цвет" },
    { id: "icons",            label: "Иконки" },
    { id: "image-libraries",  label: "Библиотеки изображений" },
    { id: "typography",       label: "Типографика" },
    { id: "illustrations",    label: "Иллюстрации" },
    { id: "accessibility",    label: "Доступность" }
  ];
  var CATEGORY_LABELS = {};
  CATEGORIES.forEach(function (c) { CATEGORY_LABELS[c.id] = c.label; });

  /* Curated from https://penpot.app/penpothub/plugins — every entry is a
     public, third-party-hosted manifest.json; nothing here is vendored. */
  var PLUGINS = [
    {id:"design-tokens-export-deploy",name:"Design Tokens Export & Deploy",author:"Yoriiis",desc:"Export your Penpot tokens to 9 languages — from CSS to TypeScript, with Git deployment",cats:["design-system","developer"],url:"https://design-tokens-export-deploy.pages.dev/manifest.json"},
    {id:"looper",name:"Looper",author:"Stas Haas",desc:"Creates trippy generated graphics by cloning shapes into iterated arrays",cats:["shapes","patterns"],url:"https://looper.girafic.net/manifest.json"},
    {id:"penpot-vectorize-plugin",name:"Penpot vectorize plugin",author:"Elhombretecla",desc:"Converts bitmap images into editable SVG paths",cats:["image-editing"],url:"https://penpot-vectorize-plugin.pages.dev/manifest.json"},
    {id:"penpot-gif-maker",name:"Penpot GIF Maker",author:"Elhombretecla",desc:"Turns selections into animated GIFs, frame-by-frame",cats:["image-editing"],url:"https://penpot-gif-maker.pages.dev/manifest.json"},
    {id:"photo-object-remover-imgour",name:"Photo Object Remover - Imgour",author:"Bikash Pokharel",desc:"AI inpainting tool to remove objects and watermarks from photos",cats:["image-editing","productivity"],url:"https://www.imgour.com/penpot-plugin/manifest.json"},
    {id:"colorslurp-importer",name:"Colorslurp Importer",author:"Jan-Frederik Stieler",desc:"Imports color palettes from ColorSlurp as JSON into a local library",cats:["color","content"],url:"https://janstieler.github.io/penpot-colorslurp-importer/manifest.json"},
    {id:"72f-design-system-generator",name:"72F Design System Generator",author:"Parth Kulkarni @ 72F Studio",desc:"Builds design systems with tokens, colors and typography in seconds",cats:["design-system","developer"],url:"https://72f-studio.github.io/72f-design-system-generator/manifest.json"},
    {id:"mockuuups-studio",name:"Mockuuups Studio",author:"Mockuuups",desc:"Professional mockup generator with 5000+ device and print mockup scenes",cats:["tools","productivity"],url:"https://penpot.mockuuups.studio/manifest.json"},
    {id:"design-md-skills",name:"Design MD Skills",author:"TypeUI",desc:"Generates design.md skill files for AI tools with style configuration",cats:["developer","design-system"],url:"https://penpot-design-skills-plugin.vercel.app/manifest.json"},
    {id:"penpot-ava-ai-visual-assistant",name:"Penpot AVA - AI Visual Assistant",author:"PSJ",desc:"AI assistant controlling the canvas through natural language commands",cats:["productivity","developer"],url:"https://penpot.thepsj.com/manifest.json"},
    {id:"icon-flow",name:"Icon flow",author:"Explified",desc:"Seamless icon library plugin for searching and inserting SVG icons",cats:["icons","content"],url:"https://icon-flow-beta.vercel.app/manifest.json"},
    {id:"design-token-manager",name:"Design Token Manager",author:"Elhombretecla",desc:"Full-featured token management directly inside Penpot",cats:["design-system","developer"],url:"https://design-token-manager.pages.dev/manifest.json"},
    {id:"html-to-design",name:"HTML TO DESIGN",author:"Eden Gilbert Kisekka",desc:"Converts HTML/Tailwind/AI code into editable Penpot layers",cats:["developer","content"],url:"https://6989e5fe2338ee253d0a2bc5--frolicking-druid-6d9eb3.netlify.app/manifest.json"},
    {id:"maskr-ai-image-processing",name:"Maskr - AI Image Processing",author:"Maskr IO, LLC",desc:"Removes backgrounds, upscales images 4x and erases objects with AI",cats:["image-editing","productivity"],url:"https://maskrdotio.github.io/plugin-penpot/manifest.json"},
    {id:"penpot-to-github-exporter",name:"PenPot to GitHub exporter",author:"Robin Scharf",desc:"Exports assets with profiles directly to GitHub repositories",cats:["developer","tools"],url:"https://robin-scharf.github.io/penpot-github-exporter/manifest.json"},
    {id:"rapid-prototyping-with-ai",name:"Rapid Prototyping with AI",author:"ramby.ai",desc:"Converts text descriptions into Penpot shapes",cats:["productivity","developer"],url:"https://ramby.ai/plugin/manifest.json"},
    {id:"super-tidy",name:"Super Tidy",author:"basiclines",desc:"Auto-organizes the canvas with frame alignment, renaming and layer sorting",cats:["productivity","tools"],url:"https://super-tidy.netlify.app/manifest.json"},
    {id:"statusup-status-management",name:"Statusup: Status management",author:"Nikita Sorochinskii",desc:"Task/process manager with 20+ status indicators and batch editing",cats:["productivity","tools"],url:"https://statusup-ppt.netlify.app/manifest.json"},
    {id:"ui-color-palette-one-wcag",name:"UI Color Palette /one・WCAG",author:"Aurélien Grimaud",desc:"WCAG-compliant palette manager with alternative color spaces",cats:["color","accessibility"],url:"https://penpot.ui-color-palette.com/manifest.json"},
    {id:"oklch-palette",name:"OKLCH Palette",author:"Elhombretecla",desc:"Perceptually uniform, accessible palette generator using OKLCH",cats:["color"],url:"https://oklch-palette.pages.dev/manifest.json"},
    {id:"connectflow",name:"ConnectFlow",author:"Elhombretecla",desc:"Creates, styles and manages visual connectors for diagrams",cats:["tools","shapes"],url:"https://connectflow-plugin.pages.dev/manifest.json"},
    {id:"semantic-tagger",name:"Semantic Tagger",author:"Elhombretecla",desc:"Assigns semantic HTML/UI tags for code export collaboration",cats:["developer","tools"],url:"https://penpot-semantic-tagger.pages.dev/manifest.json"},
    {id:"pattern-hero",name:"Pattern Hero",author:"Omikorin",desc:"Creates repeatable patterns from shapes with customization",cats:["patterns","shapes"],url:"https://penpot-pattern-hero.pages.dev/manifest.json"},
    {id:"locofy-lightning",name:"Locofy Lightning",author:"Locofy.ai",desc:"Converts designs to React, HTML/CSS, Vue, Angular and Next.js code",cats:["developer","tools"],url:"https://penpot.locofy.ai/manifest.json"},
    {id:"color-tokens-plugin",name:"Color Tokens Plugin",author:"Vicente Lyrio",desc:"Opinionated palette generator with tints/shades export",cats:["color","design-system"],url:"https://penpot-color-tokens.netlify.app/manifest.json"},
    {id:"cocomaterial-illustrations",name:"Cocomaterial illustrations",author:"David Barragán",desc:"Browse and insert SVG illustrations from cocomaterial.com",cats:["image-libraries","illustrations"],url:"https://coco-material-penpot-plugin.pages.dev/manifest.json"},
    {id:"penplot",name:"PenPLOT",author:"Sergio Galán",desc:"Draws bar, pie, radar and line charts from random or CSV data",cats:["tools","shapes"],url:"https://penplot-charting-plugin.netlify.app/manifest.json"},
    {id:"aspect-ratio",name:"Aspect Ratio",author:"Varun",desc:"Resizes boards to any aspect ratio without manual calculation",cats:["tools","productivity"],url:"https://penpot-plugin-aspect-ratio.netlify.app/manifest.json"},
    {id:"color-styles-to-json-file",name:"Color styles to JSON file",author:"Juanfran",desc:"Exports color styles as Design Tokens JSON",cats:["design-system","developer"],url:"https://colors-to-tokens.plugins.penpot.app/assets/manifest.json"},
    {id:"import-pdf",name:"Import PDF",author:"Stas Haas",desc:"Imports PDF files as images into Penpot projects",cats:["tools","image-libraries"],url:"https://import-pdf.girafic.net/manifest.json"},
    {id:"flatten-text",name:"Flatten Text",author:"Stas Haas",desc:"Converts text layers into editable vector paths",cats:["tools","shapes"],url:"https://flatten-text.girafic.net/manifest.json"},
    {id:"placeholder",name:"Placeholder +",author:"Jorge",desc:"Adds realistic placeholder content: names, phones, images",cats:["content","productivity"],url:"https://inquisitive-bienenstitch-a0a3dc.netlify.app/manifest.json"},
    {id:"dimensio-vector-to-3d",name:"Dimensio - Vector to 3D",author:"sergej",desc:"3D scene editor with customization for logos and icons",cats:["tools","shapes"],url:"https://dimensio-penpot.netlify.app/manifest.json"},
    {id:"plugins-list",name:"Plugins list",author:"Stas Haas",desc:"Browse and install Penpot plugins from the community",cats:["tools","content"],url:"https://plugins-list.girafic.net/manifest.json"},
    {id:"base64",name:"Base64",author:"Yury Zeliankouski",desc:"Encodes objects to Base64 for HTML, CSS, React and SVG",cats:["developer","tools"],url:"https://tobase64.pages.dev/manifest.json"},
    {id:"beautiful-qr-code",name:"Beautiful QR Code",author:"Omikorin",desc:"Designs vibrant QR codes with customization and export",cats:["tools","shapes"],url:"https://penpot-beautiful-qrcode.pages.dev/manifest.json"},
    {id:"squircles",name:"Squircles",author:"Lukas Nabholz",desc:"Creates squircle shapes in Penpot",cats:["shapes"],url:"https://penpot-squircles-plugin.netlify.app/manifest.json"},
    {id:"waves-generator",name:"Waves Generator",author:"Omikorin",desc:"Creates customizable wave patterns for web designs",cats:["patterns","shapes"],url:"https://penpot-waves-generator.pages.dev/manifest.json"},
    {id:"accessible-design-checklist",name:"Accessible Design Checklist",author:"Laura Kalbag",desc:"Best-practices guide with a checklist for accessible design",cats:["accessibility","tools"],url:"https://accessible-design-checklist-penpot-plugin.small-web.org/plugin/manifest.json"},
    {id:"penpot-path-editor",name:"Penpot Path Editor",author:"Alejandro Alonso",desc:"Advanced path edition tools",cats:["tools","shapes"],url:"https://penpot-path-editor.netlify.app/manifest.json"},
    {id:"kitten-kawaii",name:"Kitten Kawaii",author:"Aral Balkan",desc:"Adds cute character illustrations to designs",cats:["content","illustrations"],url:"https://kitten-kawaii-penpot-plugin.small-web.org/manifest.json"},
    {id:"contentmock",name:"ContentMock",author:"Raimund Canzler",desc:"Replaces design elements with realistic placeholder data",cats:["content","productivity"],url:"https://content-mock-penpot-plugin.netlify.app/manifest.json"},
    {id:"free-stock-search",name:"Free Stock Search",author:"ChrisLacorte",desc:"Searches Unsplash, Pexels and Pixabay from one interface",cats:["image-libraries","content"],url:"https://freestocksearch.netlify.app/manifest.json"},
    {id:"3d-mockups",name:"3D Mockups",author:"Sergej",desc:"Converts screen designs into realistic device mockups",cats:["tools","productivity"],url:"https://3d-mockups-penpot.netlify.app/manifest.json"},
    {id:"tiling-utility",name:"Tiling Utility",author:"Charly Schmidt",desc:"Creates grid or revolution patterns from shapes",cats:["patterns","tools"],url:"https://penpot-tiling-utility.netlify.app/manifest.json"},
    {id:"pomodoro",name:"Pomodoro",author:"Ceejay",desc:"Timer for focused work intervals with breaks",cats:["productivity","tools"],url:"https://penpot-pomodoro.vercel.app/manifest.json"},
    {id:"copilot",name:"Copilot",author:"Ceejay",desc:"AI-powered design assistant for quick creation",cats:["productivity","developer"],url:"https://penpot-copilot.vercel.app/manifest.json"},
    {id:"ktracer",name:"Ktracer",author:"Chekobil",desc:"Converts raster images to vector graphics",cats:["image-editing","tools"],url:"https://penpot-plugin-ktracer.surge.sh/manifest.json"},
    {id:"import-palette",name:"Import palette",author:"anveshdunna",desc:"Creates color styles from community palette URLs",cats:["color","content"],url:"https://import-palette-plugin.netlify.app/manifest.json"},
    {id:"svg-exporter",name:"SVG Exporter",author:"Zoltán Barát",desc:"Updates SVG colors to currentColor and adds classes",cats:["developer","tools"],url:"https://penpot-svg-exporter.netlify.app/manifest.json"},
    {id:"duotone",name:"Duotone",author:"sergej",desc:"Applies bold duotone image effects",cats:["image-editing","tools"],url:"https://duotone-penpot.netlify.app/manifest.json"},
    {id:"planeshifter-3d-transformations",name:"Planeshifter - 3D Transformations",author:"sergej",desc:"Rotates frames on any axis in 3D space",cats:["tools","shapes"],url:"https://planeshifter-penpot.netlify.app/manifest.json"},
    {id:"retro-halftones",name:"Retro Halftones",author:"sergej",desc:"Creates CMYK halftone dot effects for retro print",cats:["image-editing","tools"],url:"https://halftones-penpot.netlify.app/manifest.json"},
    {id:"pixelize",name:"Pixelize!",author:"sergej",desc:"Pixel art conversion tool",cats:["image-editing","tools"],url:"https://pixelize-penpot.netlify.app/manifest.json"},
    {id:"interaction-stripper",name:"Interaction Stripper",author:"Dale de Silva",desc:"Bulk removes interactions from selected boards",cats:["productivity","tools"],url:"https://penpot-interaction-stripper.netlify.app/manifest.json"},
    {id:"tracer",name:"Tracer",author:"Thierryc",desc:"Converts bitmap images to SVG using the Potrace engine",cats:["image-editing","tools"],url:"https://tracer-penpot-plugin.ap.cx/manifest.json"},
    {id:"paste-to-replace",name:"Paste to Replace",author:"Ceejay",desc:"Replaces elements without resizing via copy/paste",cats:["productivity","tools"],url:"https://which-key.vercel.app/manifest.json"},
    {id:"aspectmatic",name:"AspectMatic",author:"Emmanuel Jemeni",desc:"Aspect ratio calculation tool for developers",cats:["tools","developer"],url:"https://aspectmatic-penpot.netlify.app/manifest.json"},
    {id:"activity-tracker",name:"Activity Tracker",author:"Activity Tracker",desc:"Privacy-focused workflow monitoring and time tracking",cats:["productivity","tools"],url:"https://activity-tracker-azure.vercel.app/manifest.json"},
    {id:"real-data-filler",name:"Real Data Filler",author:"Adrien Sergent",desc:"Generates dynamic realistic data for prototypes",cats:["content","productivity"],url:"https://realdatafiller.netlify.app/manifest.json"},
    {id:"rasterman-image-editor",name:"RasterMan - Image Editor",author:"Nusry",desc:"Image editing capabilities inside Penpot",cats:["image-editing","tools"],url:"https://rasterman.netlify.app/manifest.json"},
    {id:"lucky-tools",name:"Lucky Tools",author:"Renan Mayrinck",desc:"Simulates dice rolls and coin flips",cats:["tools","productivity"],url:"https://mayrinck.github.io/Penpot-Lucky-Tools/manifest.json"},
    {id:"tailwind-styles",name:"Tailwind Styles",author:"Grafikart",desc:"Adds Tailwind colors and text styles to the library",cats:["design-system","developer"],url:"https://grafikart.github.io/penpot-plugins/tailwind-styles/manifest.json"},
    {id:"palette-swapper",name:"Palette Swapper",author:"LloydNA",desc:"Swaps one color palette for another across designs",cats:["color","productivity"],url:"https://palette-swapper.surge.sh/manifest.json"},
    {id:"tints-and-shades",name:"Tints and Shades",author:"Lukas Nabholz",desc:"Generates lighter and darker color variants",cats:["color","tools"],url:"https://penpot-tints-and-shades-plugin.netlify.app/manifest.json"},
    {id:"3d-design-viewer",name:"3D Design Viewer",author:"Nusry",desc:"Visualizes and exports designs in 3D perspective",cats:["tools","productivity"],url:"https://3d-design-viewer.netlify.app/manifest.json"},
    {id:"ico-icns-generator",name:"ico/icns Generator",author:"Varun",desc:"Exports shapes to .ico (Windows) and .icns (Mac)",cats:["developer","tools"],url:"https://penpot-plugin-icons.netlify.app/manifest.json"},
    {id:"blobbb",name:"Blobbb",author:"Nusry",desc:"Generates SVG blobs with variations",cats:["shapes","patterns"],url:"https://blobbb.netlify.app/manifest.json"},
    {id:"avatar-generator",name:"Avatar Generator",author:"Nusry",desc:"Generates avatars for designs",cats:["content","tools"],url:"https://avatar-generator-plugin.netlify.app/manifest.json"},
    {id:"sticky-notes",name:"Sticky Notes",author:"Bruno Faúndez Valenzuela",desc:"Adds sticky notes as boards for team information",cats:["productivity","tools"],url:"https://penpot-sticky-notes-plugin.esemismobruno.com/manifest.json"},
    {id:"skeleton-layout",name:"Skeleton Layout",author:"Lukas Nabholz",desc:"Transforms designs into low-fidelity skeleton versions",cats:["productivity","tools"],url:"https://penpot-skeleton-layout-plugin.netlify.app/manifest.json"},
    {id:"mockup-mirror",name:"Mockup Mirror",author:"Nusry",desc:"Previews designs on real Android devices",cats:["tools","productivity"],url:"https://mockup-mirror-plugin.netlify.app/manifest.json"},
    {id:"tailwind-html",name:"Tailwind HTML",author:"Grafikart",desc:"Generates Tailwind-compatible HTML from layers",cats:["developer","tools"],url:"https://grafikart.github.io/penpot-plugins/tailwind-html/manifest.json"},
    {id:"iconify",name:"Iconify",author:"Vjacheslav Trushkin",desc:"Access 150+ icon sets with 200k+ open-source icons",cats:["icons","content"],url:"https://penpot.iconify.design/manifest.json"},
    {id:"confettier",name:"Confettier",author:"Lukas Nabholz",desc:"Generates confetti for designs",cats:["shapes","patterns"],url:"https://penpot-confettier-plugin.netlify.app/manifest.json"},
    {id:"typescale",name:"Typescale",author:"Sam Smith",desc:"Generates modular typography scales by ratio",cats:["typography","design-system"],url:"https://penpot.typescale.io/manifest.json"},
    {id:"remove-bg",name:"Remove BG",author:"varun",desc:"Removes image backgrounds via the remove.bg API",cats:["image-editing","tools"],url:"https://penpot-remove-bg.netlify.app/manifest.json"},
    {id:"free-image-background-remover",name:"Free Image Background Remover",author:"Varun",desc:"In-browser background removal, completely free",cats:["image-editing","tools"],url:"https://penpot-free-img-remove-bg.netlify.app/manifest.json"},
    {id:"color-picker",name:"Color Picker",author:"Stas Haas",desc:"Picks colors from anywhere on screen",cats:["color","tools"],url:"https://color-picker.girafic.net/manifest.json"},
    {id:"noisy-gradients",name:"Noisy Gradients",author:"Sergej Moor",desc:"Generates Perlin-noise gradients with RGB control",cats:["patterns","tools"],url:"https://noisy-gradients-penpot-plugin.netlify.app/manifest.json"},
    {id:"shadow-playground",name:"Shadow Playground",author:"chrishollandaise",desc:"Interactive shadow preview and crafting",cats:["tools","productivity"],url:"https://shadow-playground.netlify.app/manifest.json"},
    {id:"icon-finder",name:"Icon finder",author:"Grafikart",desc:"Searches and imports icons from multiple sets",cats:["icons","content"],url:"https://grafikart.github.io/penpot-plugins/icon-finder/manifest.json"},
    {id:"shapes",name:"Shapes",author:"varun",desc:"Creates polygons, stars, circles and arcs with precision",cats:["shapes","tools"],url:"https://penpot-plugin-shapes.netlify.app/manifest.json"},
    {id:"heroicons",name:"Heroicons",author:"Salem Aljebaly",desc:"Searches and inserts Heroicons into Penpot",cats:["icons","content"],url:"https://penpot-heroicons-plugin.pages.dev/manifest.json"},
    {id:"meshy",name:"Meshy",author:"Nusry",desc:"Generates mesh gradients",cats:["patterns","tools"],url:"https://meshy-plugin.netlify.app/manifest.json"},
    {id:"map-editor",name:"Map editor",author:"Felix Sänger",desc:"Creates hand-crafted 2D maps for designs",cats:["tools","content"],url:"https://penpot-map-editor.netlify.app/manifest.json"},
    {id:"noisyy",name:"Noisyy",author:"Nusry",desc:"Generates noise textures: white, Perlin, gradient",cats:["patterns","tools"],url:"https://noisyy.netlify.app/manifest.json"},
    {id:"gridify",name:"Gridify",author:"Lukas Nabholz",desc:"Creates grids of lines or dots",cats:["shapes","patterns"],url:"https://penpot-gridify-plugin.netlify.app/manifest.json"},
    {id:"starter-profile",name:"Starter Profile",author:"Lukas Nabholz",desc:"Generates placeholder usernames, names and countries",cats:["content","productivity"],url:"https://starter-profile-plugin.netlify.app/manifest.json"},
    {id:"day-night",name:"Day & Night",author:"Christoph",desc:"Creates and switches light/dark color themes",cats:["color","design-system"],url:"https://day-and-night-for-penpot.netlify.app/manifest.json"},
    {id:"bento-generator",name:"Bento generator",author:"Gringe",desc:"Creates grid-based bento-style layouts",cats:["shapes","patterns"],url:"https://bento-plugin.netlify.app/manifest.json"},
    {id:"image-lookup",name:"Image Lookup",author:"Bruno Faúndez Valenzuela",desc:"Searches and copies stock photos from Pexels",cats:["image-libraries","content"],url:"https://penpot-image-lookup-plugin.esemismobruno.com/manifest.json"},
    {id:"typescales",name:"Typescales",author:"Nusry",desc:"Generates typographic scales",cats:["typography","design-system"],url:"https://typescales.netlify.app/manifest.json"},
    {id:"mynaui-icons",name:"MynaUI Icons",author:"Praveen Juge",desc:"Integrates open-source MynaUI icons",cats:["icons","content"],url:"https://penpot.mynaui.com/manifest.json"},
    {id:"palette",name:"Palette",author:"mart1",desc:"Generates color palettes for design systems",cats:["color","design-system"],url:"https://sage-strudel-70c89d.netlify.app/manifest.json"},
    {id:"line-length-adjuster",name:"Line Length Adjuster",author:"Yanis Gerst",desc:"Fine-tunes characters per line in text blocks",cats:["typography","tools"],url:"https://line-length-adjuster.netlify.app/manifest.json"},
    {id:"timekeeper",name:"Timekeeper",author:"Nusry",desc:"Built-in timer for creative workflows",cats:["productivity","tools"],url:"https://time-keeper-plugin.netlify.app/manifest.json"},
    {id:"stock-pix",name:"Stock Pix",author:"Nusry",desc:"Searches Unsplash stock images inside Penpot",cats:["image-libraries","content"],url:"https://stock-pix.netlify.app/manifest.json"},
    {id:"patt",name:"Patt",author:"Nusry",desc:"Generates patterns from vector shapes or custom SVGs",cats:["patterns","tools"],url:"https://patt-plugin.netlify.app/manifest.json"},
    {id:"fontscale",name:"Fontscale",author:"lplath",desc:"Creates harmonious type systems by ratio",cats:["typography","design-system"],url:"https://fontscale-penpot-plugin.netlify.app/manifest.json"},
    {id:"metaball",name:"Metaball",author:"Stas Haas",desc:"Converts ellipses into smooth 2D metaball shapes",cats:["shapes","tools"],url:"https://metaball.girafic.net/manifest.json"},
    {id:"cardforge",name:"Cardforge",author:"Pablo Alba",desc:"Creates board-game card decks for printing or digital use",cats:["tools","content"],url:"https://cardforge-dn5.pages.dev/manifest.json"},
    {id:"replace-shapes",name:"Replace Shapes",author:"Stas Haas",desc:"Replaces selected shapes with a copied shape",cats:["shapes","productivity"],url:"https://replace-shapes.girafic.net/manifest.json"},
    {id:"qrcode",name:"QRCode",author:"thierryc",desc:"Generates QR codes directly in Penpot",cats:["tools","shapes"],url:"https://qrcode-penpot-plugin.ap.cx/manifest.json"},
    {id:"illlustrations",name:"Illlustrations",author:"realvjy",desc:"120+ free vector illustrations for projects",cats:["illustrations","content"],url:"https://illlustrations-penpot.netlify.app/manifest.json"},
    {id:"pdf-viewer",name:"PDF Viewer",author:"Stas Haas",desc:"Previews PDF files in Penpot",cats:["tools","content"],url:"https://www.pdf-viewer.girafic.net/manifest.json"},
    {id:"orphaned-components-detector",name:"Orphaned Components Detector",author:"Xaviju",desc:"Locates and manages orphaned component copies",cats:["tools","productivity"],url:"https://orphaned-detector-plugin.netlify.app/manifest.json"},
    {id:"lorem-ipsum",name:"Lorem ipsum",author:"Penpot",desc:"Generates customizable Lorem Ipsum text",cats:["content","tools"],url:"https://lorem-ipsum.plugins.penpot.app/assets/manifest.json"},
    {id:"contrast-checker",name:"Contrast checker",author:"Penpot",desc:"Calculates color contrast between shapes (WCAG)",cats:["accessibility","tools"],url:"https://contrast.plugins.penpot.app/assets/manifest.json"},
    {id:"icons",name:"Icons",author:"Penpot",desc:"Inserts Feather Icons for minimalist designs",cats:["icons","content"],url:"https://icons.plugins.penpot.app/assets/manifest.json"},
    {id:"tables",name:"Tables",author:"Penpot",desc:"Imports CSV or creates tables with customization",cats:["tools","content"],url:"https://table.plugins.penpot.app/assets/manifest.json"},
    {id:"create-palette-from-library",name:"Create Palette from library",author:"Penpot",desc:"Generates a palette board from library colors",cats:["color","design-system"],url:"https://create-palette.plugins.penpot.app/assets/manifest.json"},
    {id:"rename-layers",name:"Rename layers",author:"Penpot",desc:"Adds or replaces text in layer names in bulk",cats:["productivity","tools"],url:"https://rename-layers.plugins.penpot.app/assets/manifest.json"}
  ];

  /* ── mutable state ─────────────────────────────────────────────────────── */
  var S = {
    activeFilter: "all",
    searchQuery:  "",
    overlayEl:    null
  };

  function e(s) {
    return String(s || "")
      .replace(/&/g,"&amp;").replace(/</g,"&lt;")
      .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function getNav() {
    return window.NofidaNavigation || null;
  }

  /* ============================================================
   * FILTERING
   * ========================================================== */
  function filteredPlugins() {
    var q = S.searchQuery.trim().toLowerCase();
    return PLUGINS.filter(function (p) {
      if (S.activeFilter !== "all" && p.cats.indexOf(S.activeFilter) === -1) return false;
      if (!q) return true;
      return (p.name + " " + p.author + " " + p.desc).toLowerCase().indexOf(q) !== -1;
    });
  }

  /* ============================================================
   * STYLES
   * ========================================================== */
  var HUB_CSS = [
    ".nph-shell{max-width:1280px;margin:0 auto;padding:20px 24px 72px}",
    ".nph-hdr{display:flex;align-items:center;justify-content:space-between;",
      "margin-bottom:6px;gap:12px;flex-wrap:wrap}",
    ".nph-hdr-left{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
    ".nph-dot{width:10px;height:10px;border-radius:50%;background:" + BRAND.accent + "}",
    ".nph-h1{margin:0;font-size:20px;font-weight:800;letter-spacing:-.02em}",
    ".nph-sub{color:" + BRAND.muted + ";font-size:12px;line-height:1.5;max-width:760px;margin:6px 0 18px}",
    ".nph-ctrl{margin-bottom:20px}",
    ".nph-search{width:100%;padding:10px 16px;",
      "border:1px solid " + BRAND.border + ";border-radius:12px;",
      "background:" + BRAND.surface + ";color:" + BRAND.text + ";",
      "font-size:14px;outline:none;box-sizing:border-box;font-family:inherit}",
    ".nph-search:focus{border-color:" + BRAND.primary + "}",
    ".nph-filters{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}",
    ".nph-flt{border:1px solid " + BRAND.border + ";border-radius:999px;",
      "padding:5px 14px;background:0;color:" + BRAND.muted + ";",
      "font-size:12px;font-weight:600;cursor:pointer;transition:all .14s}",
    ".nph-flt:hover{border-color:" + BRAND.primary + ";color:" + BRAND.text + "}",
    ".nph-flt.on{border-color:" + BRAND.accent + ";color:" + BRAND.accent + ";",
      "background:rgba(107,169,143,.10)}",
    ".nph-status{font-size:12px;color:" + BRAND.muted + ";margin-bottom:16px;min-height:18px}",
    ".nph-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:16px}",
    ".nph-empty{grid-column:1/-1;padding:48px;text-align:center;color:" + BRAND.muted + "}",
    ".nph-card{background:" + BRAND.surface + ";border:1px solid " + BRAND.border + ";",
      "border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:10px;",
      "transition:border-color .14s,transform .14s}",
    ".nph-card:hover{border-color:rgba(94,126,166,.55);transform:translateY(-2px)}",
    ".nph-card-top{display:flex;align-items:center;gap:10px}",
    ".nph-icon{flex-shrink:0;width:34px;height:34px;border-radius:10px;",
      "background:rgba(107,169,143,.14);display:flex;align-items:center;justify-content:center}",
    ".nph-icon svg{width:18px;height:18px}",
    ".nph-card-title{margin:0;font-size:14px;font-weight:700;line-height:1.3}",
    ".nph-author{font-size:11px;color:" + BRAND.muted + "}",
    ".nph-desc{font-size:12px;color:" + BRAND.text + ";opacity:.82;line-height:1.5;flex:1}",
    ".nph-pills{display:flex;flex-wrap:wrap;gap:6px}",
    ".nph-pill{font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;",
      "letter-spacing:.04em;background:rgba(148,163,184,.1);color:" + BRAND.muted + "}",
    ".nph-btn{border:0;border-radius:10px;padding:9px 14px;font-size:13px;",
      "font-weight:700;cursor:pointer;transition:all .14s;width:100%;",
      "margin-top:auto;font-family:inherit;background:" + BRAND.primary + ";color:#fff}",
    ".nph-btn:hover{background:" + BRAND.primaryHov + "}",
    "@media(max-width:640px){.nph-shell{padding:16px 12px 44px}.nph-grid{grid-template-columns:1fr}}"
  ].join("");

  function ensureHubStyles() {
    if (document.getElementById("nph-styles")) return;
    var style = document.createElement("style");
    style.id = "nph-styles";
    style.textContent = HUB_CSS;
    document.head.appendChild(style);
  }

  var ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M9 3v3M15 3v3M6 8h12a1 1 0 0 1 1 1v3a4 4 0 0 1-4 4h-.5a2.5 2.5 0 0 0-2.5 2.5V21h-4v-2.5A2.5 2.5 0 0 0 9.5 16H9a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z" ' +
    'stroke="' + BRAND.accent + '" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ============================================================
   * RENDER
   * ========================================================== */
  function renderCard(item) {
    var pills = item.cats.map(function (c) {
      return '<span class="nph-pill">' + e(CATEGORY_LABELS[c] || c) + '</span>';
    }).join("");
    return [
      '<article class="nph-card" data-id="' + e(item.id) + '">',
      '  <div class="nph-card-top">',
      '    <span class="nph-icon">' + ICON_SVG + '</span>',
      '    <div>',
      '      <h3 class="nph-card-title">' + e(item.name) + '</h3>',
      '      <div class="nph-author">' + e(item.author) + '</div>',
      '    </div>',
      '  </div>',
      '  <p class="nph-desc">' + e(item.desc) + '</p>',
      '  <div class="nph-pills">' + pills + '</div>',
      '  <button class="nph-btn" type="button" data-act="install" data-id="' + e(item.id) + '">Установить</button>',
      "</article>"
    ].join("");
  }

  function renderGrid() {
    var list = filteredPlugins();
    if (!list.length) {
      return '<div class="nph-empty">Ничего не найдено. Попробуйте изменить запрос или фильтр.</div>';
    }
    return list.map(renderCard).join("");
  }

  function updateStatusBar() {
    if (!S.overlayEl) return;
    var status = S.overlayEl.querySelector("#nph-status");
    if (!status) return;
    var count = filteredPlugins().length;
    status.textContent = "Показано: " + count + " из " + PLUGINS.length;
  }

  function refreshGrid() {
    if (!S.overlayEl) return;
    var grid = S.overlayEl.querySelector("#nph-grid");
    if (grid) grid.innerHTML = renderGrid();
  }

  function buildShellContent() {
    var filterHtml = CATEGORIES.map(function (c) {
      return '<button class="nph-flt' + (c.id === "all" ? " on" : "") +
        '" data-f="' + e(c.id) + '">' + e(c.label) + '</button>';
    }).join("");

    return [
      '<div id="nph-shell-root">',
      '  <div class="nph-hdr">',
      '    <div class="nph-hdr-left">',
      '      <span class="nph-dot"></span>',
      '      <h2 class="nph-h1">Плагины NOFIDA</h2>',
      '    </div>',
      '  </div>',
      '  <div class="nph-sub">Каталог плагинов, совместимых с движком NOFIDA. «Установить» открывает системное окно с запросом разрешений плагина — установка выполняется полностью встроенным механизмом, без ручной конвертации.</div>',
      '  <div class="nph-ctrl">',
      '    <input class="nph-search" id="nph-search" type="search" placeholder="Поиск плагинов по названию, автору, описанию…" autocomplete="off" />',
      '    <div class="nph-filters" id="nph-filters">' + filterHtml + '</div>',
      '  </div>',
      '  <div class="nph-status" id="nph-status"></div>',
      '  <div class="nph-grid" id="nph-grid">' + renderGrid() + '</div>',
      "</div>"
    ].join("");
  }

  function installPlugin(item) {
    window.location.hash = "?plugin=" + encodeURIComponent(item.url);
  }

  function bindShellEvents() {
    var root = document.getElementById("nph-shell-root");
    if (!root) return null;
    S.overlayEl = root;
    if (root.getAttribute("data-nph-bound") === "true") return root;
    root.setAttribute("data-nph-bound", "true");

    root.querySelector("#nph-search").addEventListener("input", function (ev) {
      S.searchQuery = ev.target.value;
      refreshGrid();
      updateStatusBar();
    });

    root.querySelector("#nph-filters").addEventListener("click", function (ev) {
      var btn = ev.target.closest(".nph-flt");
      if (!btn) return;
      S.activeFilter = btn.getAttribute("data-f") || "all";
      root.querySelectorAll(".nph-flt").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-f") === S.activeFilter);
      });
      refreshGrid();
      updateStatusBar();
    });

    root.querySelector("#nph-grid").addEventListener("click", function (ev) {
      var btn = ev.target.closest(".nph-btn");
      if (!btn) return;
      var itemId = btn.getAttribute("data-id");
      var item = PLUGINS.filter(function (p) { return p.id === itemId; })[0];
      if (item) installPlugin(item);
    });

    return root;
  }

  /* ============================================================
   * SHOW / HIDE
   * ========================================================== */
  function showHub() {
    var nav = getNav();
    ensureHubStyles();
    if (!nav) return;
    nav.renderDashboardShell({
      owner: "plugin-hub",
      route: HUB_HASH,
      activeId: "plugins",
      breadcrumb: ["Панель", "Ресурсы", "Плагины"],
      title: "Плагины NOFIDA",
      subtitle: "Каталог плагинов, совместимых с движком NOFIDA.",
      contentHtml: buildShellContent()
    });
    bindShellEvents();
    updateStatusBar();
  }

  function hideHub() {
    S.overlayEl = null;
  }

  /* ============================================================
   * HASH / ROUTE LISTENER
   * ========================================================== */
  function onHashChange() {
    var hash = window.location.hash || "";
    if (hash === HUB_HASH || hash.indexOf(HUB_HASH + "/") === 0 || hash.indexOf(HUB_HASH + "?") === 0) {
      showHub();
      return;
    }
    if (S.overlayEl) hideHub();
  }

  /* ============================================================
   * INIT
   * ========================================================== */
  function init() {
    ensureHubStyles();
    window.addEventListener("hashchange", onHashChange);

    var h = window.location.hash || "";
    if (h === HUB_HASH || h.indexOf(HUB_HASH + "/") === 0 || h.indexOf(HUB_HASH + "?") === 0) {
      showHub();
    }

    window.NofidaPluginHub = {
      open: function () {
        var nav = getNav();
        if (nav) nav.goToNofidaRoute(HUB_HASH, { source: "plugin-hub-api" });
        else window.location.hash = "/nofida/plugins";
      },
      close: hideHub
    };
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(init, 0);
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
