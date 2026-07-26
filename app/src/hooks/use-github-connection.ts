import { useCallback, useEffect, useRef, useState } from 'react';

import { asGitHubError } from '@/features/github/errors';
import {
  credentialsFromDeviceGrant,
  pollForAccessToken,
  requestDeviceCode,
  validatePat,
} from '@/lib/github-auth';
import { useGitHubSessionStore } from '@/stores/github-session-store';

interface DeviceFlowUiState {
  userCode: string;
  verificationUrl: string;
  expiresAt: number;
}

export function useGitHubConnection() {
  const connection = useGitHubSessionStore((store) => store.state);
  const initialize = useGitHubSessionStore((store) => store.initialize);
  const connect = useGitHubSessionStore((store) => store.connect);
  const disconnect = useGitHubSessionStore((store) => store.disconnect);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowUiState | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [patPending, setPatPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (connection.status === 'initializing') initialize();
  }, [connection.status, initialize]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const cancelDeviceFlow = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setDeviceFlow(null);
  }, []);

  const beginDeviceFlow = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setConnectionError(null);
    try {
      const code = await requestDeviceCode(controller.signal);
      setDeviceFlow({
        userCode: code.user_code,
        verificationUrl: code.verification_uri,
        expiresAt: Date.now() + code.expires_in * 1000,
      });
      const grant = await pollForAccessToken(
        code.device_code,
        code.interval,
        controller.signal,
        code.expires_in
      );
      const credentials = await credentialsFromDeviceGrant(grant, controller.signal);
      await connect(credentials);
      setDeviceFlow(null);
    } catch (error) {
      if (controller.signal.aborted) return;
      setConnectionError(asGitHubError(error).message);
      setDeviceFlow(null);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [connect]);

  const connectPat = useCallback(
    async (token: string) => {
      setPatPending(true);
      setConnectionError(null);
      try {
        const credentials = await validatePat(token);
        await connect(credentials);
      } catch (error) {
        const githubError = asGitHubError(error);
        setConnectionError(githubError.message);
        throw githubError;
      } finally {
        setPatPending(false);
      }
    },
    [connect]
  );

  return {
    connection,
    deviceFlow,
    connectionError,
    patPending,
    initialize,
    beginDeviceFlow,
    cancelDeviceFlow,
    connectPat,
    disconnect,
    clearConnectionError: () => setConnectionError(null),
  };
}
