import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { DataProvider } from "./create-data-provider";

const DataProviderContext = createContext<DataProvider | null>(null);

/** Props for {@link TempestDataProvider}. */
export interface TempestDataProviderProps {
    /** The data provider to expose to descendant resource hooks. */
    provider: DataProvider;
    /** The subtree that consumes the provider. */
    children: ReactNode;
}

/**
 * Inject a {@link DataProvider} into the React tree so the resource hooks
 * (`useList`, `useOne`, `useCreate`, …) can resolve it via {@link useDataProvider}.
 *
 * @example
 * const dataProvider = createDataProvider(apiClient);
 * <TempestDataProvider provider={dataProvider}>
 *     <App />
 * </TempestDataProvider>
 */
export function TempestDataProvider({ provider, children }: TempestDataProviderProps) {
    return <DataProviderContext.Provider value={provider}>{children}</DataProviderContext.Provider>;
}

/**
 * Read the {@link DataProvider} from context.
 *
 * @returns The data provider supplied to the nearest {@link TempestDataProvider}.
 * @throws {Error} When used outside a {@link TempestDataProvider}.
 */
export function useDataProvider(): DataProvider {
    const provider = useContext(DataProviderContext);
    if (!provider) {
        throw new Error("useDataProvider must be used within a <TempestDataProvider>");
    }
    return provider;
}
