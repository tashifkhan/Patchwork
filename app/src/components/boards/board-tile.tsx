import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';

import { jiraImageHeaders } from '@/api/jira';

import type { BoardSummary } from '@/features/boards/model';
import { useTheme } from '@/components/theme/context';
import { useJiraCredentials } from '@/stores/jira-session-store';
import { View } from '@/tw';

/**
 * Square tile that identifies a board: the Jira project avatar when there is
 * one, else the Deck board color with a glyph for its source.
 */
export function BoardTile({
  board,
  size = 44,
  imageHeaders,
}: {
  board: BoardSummary;
  size?: number;
  /** Defaults to the auth headers of the Jira login the board belongs to. */
  imageHeaders?: Record<string, string>;
}) {
  const { colors } = useTheme();
  const credentials = useJiraCredentials(board.source === 'jira' ? board.accountId : undefined);
  const headers = useMemo(
    () => imageHeaders ?? (credentials ? jiraImageHeaders(credentials) : undefined),
    [credentials, imageHeaders]
  );
  const [failed, setFailed] = useState(false);
  const radius = Math.round(size * 0.28);

  if (board.imageUrl && !failed) {
    return (
      <Image
        source={{ uri: board.imageUrl, headers }}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        accessibilityIgnoresInvertColors
      />
    );
  }

  const fill = board.color ?? (board.source === 'jira' ? '#2684FF' : colors.accent);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        borderCurve: 'continuous',
        backgroundColor: fill,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <MaterialCommunityIcons
        name={board.source === 'jira' ? 'jira' : 'view-column'}
        size={Math.round(size * 0.52)}
        color="#FFFFFF"
      />
    </View>
  );
}
