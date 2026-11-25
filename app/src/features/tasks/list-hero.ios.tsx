import { Button, Divider, HStack, Host, Image, Menu, Section, Text as SwiftText } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit } from '@expo/ui/swift-ui/modifiers';
import type { SFSymbol } from 'expo-symbols';

import { useTheme } from '@/components/theme/context';
import { haptics } from '@/lib/haptics';
import { Text, View } from '@/tw';

import type { ListHeroKind, ListHeroProps } from './list-hero-types';
import { OfflineChip } from './offline-chip';

const GLYPH: Record<ListHeroKind, SFSymbol> = {
  all: 'tray.full.fill',
  list: 'list.bullet.circle.fill',
  repo: 'chevron.left.forwardslash.chevron.right',
};

/**
 * Things-style large title that is also a native pull-down menu. Tapping it
 * shows every list grouped by account, GitHub repos, and the list actions,
 * with a check on the current one. "All lists" opens the sheet with counts.
 */
export function ListHero({ title, subtitle, kind = 'all', onPress, menu, onOfflinePress }: ListHeroProps) {
  const { colors } = useTheme();
  const accounts = menu ? [...new Set(menu.lists.map((l) => l.account_name).filter(Boolean))] : [];
  const grouped = accounts.length > 1;

  const pick = (id: string | null) => {
    haptics.selection();
    menu?.onSelect(id);
  };
  const mark = (id: string | null, fallback: SFSymbol): SFSymbol =>
    menu?.selectedListId === id ? 'checkmark' : fallback;

  const label = (
    <HStack spacing={10} alignment="center">
      <Image systemName={GLYPH[kind]} size={26} color={kind === 'repo' ? colors.text : colors.accent} />
      <SwiftText modifiers={[font({ size: 34, weight: 'bold' }), foregroundStyle(colors.text), lineLimit(1)]}>
        {title}
      </SwiftText>
      <Image systemName="chevron.down.circle.fill" size={20} color={colors.text3} />
    </HStack>
  );

  return (
    <View style={{ alignSelf: 'flex-start', maxWidth: '100%' }}>
      <Host matchContents>
        {menu ? (
          <Menu label={label}>
            <Button label="All Tasks" systemImage={mark(null, 'tray.full')} onPress={() => pick(null)} />
            {(grouped ? accounts : [undefined]).map((account) => {
              const rows = menu.lists
                .filter((l) => !grouped || l.account_name === account)
                .map((list) => (
                  <Button
                    key={list.id}
                    label={list.name}
                    systemImage={mark(list.id, 'list.bullet')}
                    onPress={() => pick(list.id)}
                  />
                ));
              return grouped ? (
                <Section key={account} title={account}>
                  {rows}
                </Section>
              ) : (
                <Section key="lists">{rows}</Section>
              );
            })}
            {menu.repos.length > 0 ? (
              <Section title="GitHub">
                {menu.repos.map((repo) => (
                  <Button
                    key={repo.fullName}
                    label={repo.fullName.split('/')[1] ?? repo.fullName}
                    systemImage={mark(`gh:${repo.fullName}`, 'chevron.left.forwardslash.chevron.right')}
                    onPress={() => pick(`gh:${repo.fullName}`)}
                  />
                ))}
              </Section>
            ) : null}
            <Divider />
            <Button label="All Lists…" systemImage="list.bullet.rectangle" onPress={onPress} />
            <Button label="New List" systemImage="plus" onPress={menu.onCreate} />
            {menu.onEdit ? <Button label="Edit List" systemImage="pencil" onPress={menu.onEdit} /> : null}
          </Menu>
        ) : (
          <Button onPress={onPress}>{label}</Button>
        )}
      </Host>
      <View className="flex-row items-center" style={{ gap: 8, marginTop: 2, marginLeft: 36 }}>
        <Text style={{ fontSize: 15, color: colors.text2 }}>{subtitle}</Text>
        {onOfflinePress ? <OfflineChip onPress={onOfflinePress} /> : null}
      </View>
    </View>
  );
}
