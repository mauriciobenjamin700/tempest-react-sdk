export { Icon } from "./Icon";
export type { IconProps } from "./Icon";
export { IconPicker } from "./IconPicker";
export { DEFAULT_ICON_PICKER_MESSAGE, validateIconName } from "./validate-icon-name";
export type { IconPickerProps } from "./IconPicker";
export { IconProvider } from "./IconProvider";
export type { IconProviderProps } from "./IconProvider";
export { createIconRegistry } from "./icon-context";
export type { IconRegistry } from "./icon-context";
export { resolveIconAlias } from "./alias";
export {
    iconStatus,
    loadIcon,
    peekIcon,
    preloadIcons,
    registerIcons,
    subscribeToIconErrors,
} from "./shard-cache";
export type { IconLoadError } from "./shard-cache";
export { useIcon } from "./use-icon";
export { isIconName } from "./is-icon-name";
export { normalizeIconName } from "./normalize-icon-name";
export { fromMaterialSymbol, materialToLucide, MATERIAL_SYMBOL_FALLBACK } from "./material-symbols";
export { iconAliases } from "./generated/aliases";
export { iconNames } from "./generated/icon-names";
export type { IconName } from "./generated/icon-name";
