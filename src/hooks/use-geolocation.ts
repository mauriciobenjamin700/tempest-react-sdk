import { useEffect, useState } from "react";

export interface GeolocationState {
    loading: boolean;
    error: GeolocationPositionError | null;
    coords: GeolocationCoordinates | null;
    timestamp: number | null;
}

export interface UseGeolocationOptions extends PositionOptions {
    /** Use `watchPosition` instead of one-shot `getCurrentPosition`. Default: false. */
    watch?: boolean;
    /** Disable the hook without unmounting. Default: false. */
    disabled?: boolean;
}

/** React hook around the Geolocation API. */
export function useGeolocation(options: UseGeolocationOptions = {}): GeolocationState {
    const { watch = false, disabled = false, ...positionOptions } = options;
    const [state, setState] = useState<GeolocationState>({
        loading: !disabled,
        error: null,
        coords: null,
        timestamp: null,
    });

    useEffect(() => {
        if (disabled || typeof navigator === "undefined" || !navigator.geolocation) {
            setState((prev) => ({ ...prev, loading: false }));
            return;
        }

        const onSuccess = (position: GeolocationPosition): void => {
            setState({
                loading: false,
                error: null,
                coords: position.coords,
                timestamp: position.timestamp,
            });
        };
        const onError = (error: GeolocationPositionError): void => {
            setState((prev) => ({ ...prev, loading: false, error }));
        };

        if (watch) {
            const watchId = navigator.geolocation.watchPosition(
                onSuccess,
                onError,
                positionOptions,
            );
            return () => navigator.geolocation.clearWatch(watchId);
        }

        navigator.geolocation.getCurrentPosition(onSuccess, onError, positionOptions);
        return undefined;
    }, [
        disabled,
        watch,
        positionOptions.enableHighAccuracy,
        positionOptions.maximumAge,
        positionOptions.timeout,
    ]);

    return state;
}
