import type { TaskList } from '@/api/types';
import type { GitHubRepositorySelection } from '@/features/github/types';

export type ListHeroKind = 'all' | 'list' | 'repo';

export interface ListHeroMenu {
  lists: TaskList[];
  repos: GitHubRepositorySelection[];
  selectedListId: string | null;
  onSelect: (listId: string | null) => void;
  onCreate: () => void;
  /** Only offered when a list (not All Tasks or a repo) is selected. */
  onEdit: (() => void) | null;
}

export interface ListHeroProps {
  title: string;
  subtitle: string;
  kind?: ListHeroKind;
  /** Opens My lists, the full switcher with counts. */
  onPress: () => void;
  /** iOS: the lists for the native pull-down menu. Without it, a tap opens My lists. */
  menu?: ListHeroMenu;
}
