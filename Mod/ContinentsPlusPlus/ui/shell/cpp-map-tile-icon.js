// Continents++ — map picker tile icon decorator (shell scope).
//
// The base game hardcodes map tile icons in
// core/ui-next/screens/create-game/create-game-setup-model.js (a Map keyed by
// the resolved map NAME), so custom maps resolve to an empty `url('blp:.png')`
// and their picker tile renders without an image. There is no database hook
// for it, so this script watches the create-game DOM and applies our icon to
// any map tile / setup selector whose label is our map name.

const CPP_MAP_NAME = "Continents++";
const CPP_ICON_URL = "url('fs://game/continentsplusplus/ui/icons/continents_plus_plus_map_icon.png')";

// Icon divs used by the map picker tiles and the game-setup summary box.
// The Game Setup "Map Type" box renders its Icon with only utility classes
// (`size-18`, no selector-icon class) when the option has no description, so
// also match any Icon component inside a setup box.
const ICON_SELECTOR = ".create-game-map-select-icon, .create-game-setup-box-selector-icon, .create-game-setup-box [data-name=\"Icon\"]";
// Containers that carry both the icon and the map name label.
const BOX_SELECTOR = ".create-game-map-select-box, .create-game-map-select, .create-game-setup-box";

function applyCppIcon(root) {
    if (!root || !root.querySelectorAll) {
        return;
    }
    const icons = root.querySelectorAll(ICON_SELECTOR);
    for (const iconEl of icons) {
        const box = iconEl.closest(BOX_SELECTOR) ?? iconEl.parentElement?.parentElement;
        if (!box || !box.textContent || !box.textContent.includes(CPP_MAP_NAME)) {
            continue;
        }
        // Guard against re-set loops from the MutationObserver below.
        // Compare by substring: the style getter normalizes URL quoting, so an
        // exact string compare would re-set (and re-trigger) forever.
        if (!iconEl.style.backgroundImage.includes("continents_plus_plus_map_icon")) {
            iconEl.style.backgroundImage = CPP_ICON_URL;
        }
    }
}

const cppIconObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
        if (m.type === "childList") {
            for (const node of m.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    applyCppIcon(node);
                }
            }
        } else if (m.type === "attributes") {
            // Solid re-applies inline styles on re-render; re-check the tile.
            applyCppIcon(m.target.parentElement ?? m.target);
        }
    }
});

cppIconObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style"],
});
applyCppIcon(document.body);

console.log("[ContinentsPP] Map tile icon decorator active");
