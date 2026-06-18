import { packFontContext } from "./font-context-packer.mjs";
import { packMediaContext } from "./media-context-packer.mjs";

export function packResourceContext({
  taskType,
  userPrompt,
  fontCatalogItems,
  mediaCatalogItems,
  preferredFontCategories = [],
  preferredMediaCategories = [],
  preferredStyles = []
}) {
  const fonts = packFontContext({
    taskType,
    userPrompt,
    catalogItems: fontCatalogItems,
    preferredCategories: preferredFontCategories
  });

  const media = packMediaContext({
    taskType,
    userPrompt,
    catalogItems: mediaCatalogItems,
    preferredCategories: preferredMediaCategories,
    preferredStyles
  });

  const approvedFonts = Array.isArray(fontCatalogItems)
    ? fontCatalogItems.filter((item) => item.approvalStatus === "approved").length
    : 0;
  const approvedMedia = Array.isArray(mediaCatalogItems)
    ? mediaCatalogItems.filter((item) => item.approvalStatus === "approved").length
    : 0;

  return {
    totals: {
      fonts: fonts.totalFonts || 0,
      media: media.totalMedia || 0,
      approvedFonts,
      approvedMedia
    },
    fonts,
    media,
    truncated: Boolean(fonts.truncated || media.truncated)
  };
}
