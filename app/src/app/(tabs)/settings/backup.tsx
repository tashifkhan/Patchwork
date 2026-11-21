import { router } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import {
  RowSeparator,
  SettingsCell,
  SettingsGroup,
  SettingsRow,
  SettingsScreen,
} from '@/components/settings/settings-list';
import { useImportConfirm } from '@/components/tasks/import-confirm';
import { useTheme } from '@/components/theme/context';
import { Button } from '@/components/ui/button';
import { useTaskLists, useTasks } from '@/hooks/use-tasks';
import { buildBackup, buildMarkdown, planFromText } from '@/lib/backup';
import { Text, TextInput } from '@/tw';

async function shareFile(name: string, content: string, mimeType: string) {
  const [{ File, Paths }, Sharing] = await Promise.all([import('expo-file-system'), import('expo-sharing')]);
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name, UTI: mimeType === 'application/json' ? 'public.json' : 'net.daringfireball.markdown' });
}

const stamp = () => new Date().toISOString().slice(0, 10);

/**
 * Backup and moving to-dos in and out: a full JSON backup, a Markdown
 * checklist (Karui, Obsidian and most notes apps read it), pasted text, and
 * QR codes from another phone.
 */
export default function BackupSettingsScreen() {
  const { colors } = useTheme();
  const listsQuery = useTaskLists();
  const tasksQuery = useTasks();
  const lists = (listsQuery.data ?? []).filter((list) => !list.is_deck);
  const tasks = tasksQuery.data ?? [];
  const [pasted, setPasted] = useState('');
  const importer = useImportConfirm(() => setPasted(''));
  const [error, setError] = useState<string | null>(null);
  const ready = listsQuery.isSuccess && tasksQuery.isSuccess;

  async function exportAs(kind: 'json' | 'md') {
    setError(null);
    try {
      if (kind === 'json') {
        await shareFile(`patchwork-${stamp()}.json`, JSON.stringify(buildBackup(lists, tasks), null, 2), 'application/json');
      } else {
        await shareFile(`patchwork-${stamp()}.md`, buildMarkdown(lists, tasks), 'text/markdown');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export.');
    }
  }

  function importText(text: string, fallbackName: string) {
    setError(null);
    try {
      const plan = planFromText(text, fallbackName);
      if (plan.total === 0) {
        setError('No to-dos found. Use lines like "- [ ] buy milk" under "## List name" headings.');
        return;
      }
      importer.confirm(plan);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That file couldn't be read.");
    }
  }

  async function importFile() {
    const [DocumentPicker, { File }] = await Promise.all([import('expo-document-picker'), import('expo-file-system')]);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/json', 'text/markdown', 'text/plain', 'text/x-markdown', '*/*'],
      copyToCacheDirectory: true,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    try {
      const text = await new File(asset.uri).text();
      importText(text, asset.name.replace(/\.(md|markdown|txt|json)$/i, '') || 'Imported');
    } catch {
      setError("That file couldn't be read.");
    }
  }

  return (
    <SettingsScreen>
      <SettingsGroup
        title="Export"
        footer="JSON keeps everything Patchwork knows about each to-do. Markdown is a plain checklist other apps can open.">
        <SettingsRow
          icon="code-json"
          title="Back up as JSON"
          subtitle={ready ? `${lists.length} lists` : 'Loading your to-dos…'}
          disabled={!ready}
          onPress={() => void exportAs('json')}
        />
        <RowSeparator />
        <SettingsRow
          icon="language-markdown-outline"
          title="Export as Markdown"
          disabled={!ready}
          onPress={() => void exportAs('md')}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Import"
        footer="Imports add new to-dos and never overwrite. Lists are matched by name.">
        <SettingsRow icon="file-import-outline" title="Import a file" subtitle="Patchwork JSON or Markdown" onPress={() => void importFile()} />
        <RowSeparator />
        <SettingsRow
          icon="qrcode-scan"
          title="Scan a QR code"
          subtitle="From Patchwork or Karui on another phone"
          showChevron
          onPress={() => router.push('/scan')}
        />
      </SettingsGroup>

      <SettingsGroup title="Paste">
        <SettingsCell>
          <TextInput
            value={pasted}
            onChangeText={setPasted}
            multiline
            placeholder={'## Groceries\n- [ ] oat milk\n- [ ] bread'}
            placeholderTextColor={colors.text3}
            textAlignVertical="top"
            accessibilityLabel="Text to import"
            className="text-sf-text"
            style={{ minHeight: 110, fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
          />
          <Button
            label="Import pasted text"
            variant="tonal"
            icon="clipboard-arrow-down-outline"
            disabled={!pasted.trim() || importer.busy}
            loading={importer.busy}
            onPress={() => importText(pasted, 'Imported')}
          />
        </SettingsCell>
      </SettingsGroup>

      {error ? <Text selectable className="text-sf-red px-2 text-sm">{error}</Text> : null}
      {importer.element}
    </SettingsScreen>
  );
}
