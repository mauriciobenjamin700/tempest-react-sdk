export { createDataProvider, encodeIdSegment } from "./create-data-provider";
export type {
    DataProvider,
    DeleteManyResult,
    DataProviderOptions,
    GetListParams,
    DataFilters,
} from "./create-data-provider";

export { TempestDataProvider, useDataProvider } from "./data-provider-context";
export type { TempestDataProviderProps } from "./data-provider-context";

export {
    useList,
    useOne,
    useCreate,
    useUpdate,
    useDelete,
    useDeleteMany,
    listQueryKey,
    oneQueryKey,
} from "./use-resource";
export type {
    UseListOptions,
    UseOneOptions,
    UseCreateOptions,
    UseUpdateOptions,
    UseDeleteOptions,
    UseDeleteManyOptions,
    UpdateVariables,
} from "./use-resource";
