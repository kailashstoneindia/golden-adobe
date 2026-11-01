import { Role, type ArtisanTeamMemberDto } from '@golden-abode/types';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../src/components/demo/DemoScreen';
import { Button, Card, EmptyStateCard, Text, TextInput } from '../../src/components/ui';
import { EMPTY_STATE_MESSAGES, ERROR_MESSAGES, TOAST_MESSAGES } from '../../src/constants';
import {
  useAddTeamMemberMutation,
  useArtisanProfileQuery,
  useRemoveTeamMemberMutation,
  useUpdateTeamMemberMutation,
} from '../../src/hooks/artisans';
import { useAuth } from '../../src/hooks/auth';
import { useToast } from '../../src/hooks/useToast';
import { Colors, Spacing } from '../../src/theme';
import { getApiErrorMessage } from '../../src/utils';

type TeamMemberFormValues = { name: string; roleOnTeam: string; phone: string };

const EMPTY_MEMBER_FORM: TeamMemberFormValues = { name: '', roleOnTeam: '', phone: '' };

export default function ArtisanTeamScreen() {
  const { user } = useAuth();
  const profileQuery = useArtisanProfileQuery(user?.role === Role.ARTISAN);
  const addMember = useAddTeamMemberMutation();
  const updateMember = useUpdateTeamMemberMutation();
  const removeMember = useRemoveTeamMemberMutation();
  const { showSuccess, showError } = useToast();
  const team = profileQuery.data?.team ?? [];
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<TeamMemberFormValues>(EMPTY_MEMBER_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const isSaving = addMember.isPending || updateMember.isPending;

  const resetForm = (): void => {
    setEditingMemberId(null);
    setFormValues(EMPTY_MEMBER_FORM);
    setFormError(null);
  };

  const handleEdit = (member: ArtisanTeamMemberDto): void => {
    setEditingMemberId(member.id);
    setFormValues({
      name: member.name ?? '',
      roleOnTeam: member.roleOnTeam ?? '',
      phone: member.phone ?? '',
    });
    setFormError(null);
  };

  const handleSave = (): void => {
    const name = formValues.name.trim();
    if (!name) {
      setFormError(ERROR_MESSAGES.teamMemberNameRequired);
      return;
    }
    // The API rejects empty strings, so blank optionals are left out.
    const roleOnTeam = formValues.roleOnTeam.trim();
    const phone = formValues.phone.trim();
    const body = { name, ...(roleOnTeam ? { roleOnTeam } : {}), ...(phone ? { phone } : {}) };
    const callbacks = {
      onSuccess: () => {
        showSuccess(TOAST_MESSAGES.teamMemberSaved);
        resetForm();
      },
      onError: (error: unknown) =>
        showError(getApiErrorMessage(error, ERROR_MESSAGES.teamMemberSaveFailed)),
    };
    if (editingMemberId) {
      updateMember.mutate({ memberId: editingMemberId, body }, callbacks);
    } else {
      addMember.mutate(body, callbacks);
    }
  };

  const handleRemove = (memberId: string): void => {
    removeMember.mutate(memberId, {
      onSuccess: () => {
        showSuccess(TOAST_MESSAGES.teamMemberRemoved);
        if (editingMemberId === memberId) {
          resetForm();
        }
      },
      onError: (error) =>
        showError(getApiErrorMessage(error, ERROR_MESSAGES.teamMemberDeleteFailed)),
    });
  };

  return (
    <DemoScreen title="My team" subtitle="Crew members who work on your jobs" showBack>
      <Card style={styles.formCard}>
        <Text variant="bodyMedium">{editingMemberId ? 'Edit team member' : 'Add team member'}</Text>
        <TextInput
          label="Name"
          placeholder="Suresh"
          value={formValues.name}
          onChangeText={(name) => setFormValues((previous) => ({ ...previous, name }))}
          autoCapitalize="words"
        />
        <TextInput
          label="Role (optional)"
          placeholder="Helper"
          value={formValues.roleOnTeam}
          onChangeText={(roleOnTeam) => setFormValues((previous) => ({ ...previous, roleOnTeam }))}
        />
        <TextInput
          label="Phone (optional)"
          placeholder="9876543210"
          value={formValues.phone}
          onChangeText={(phone) => setFormValues((previous) => ({ ...previous, phone }))}
          keyboardType="phone-pad"
        />
        {formError ? (
          <Text variant="caption" color={Colors.brick}>
            {formError}
          </Text>
        ) : null}
        <View style={styles.formActions}>
          <Button
            title={isSaving ? 'Saving…' : editingMemberId ? 'Save changes' : 'Add member'}
            disabled={isSaving}
            onPress={handleSave}
          />
          {editingMemberId ? <Button title="Cancel" variant="ghost" onPress={resetForm} /> : null}
        </View>
      </Card>

      {profileQuery.isLoading ? (
        <Text variant="body" color={Colors.inkSoft}>
          Loading team…
        </Text>
      ) : team.length === 0 ? (
        <EmptyStateCard message={EMPTY_STATE_MESSAGES.teamEmpty} />
      ) : (
        team.map((member) => (
          <Card key={member.id} style={styles.memberCard}>
            <View style={styles.memberText}>
              <Text variant="bodyMedium">{member.name ?? 'Unnamed member'}</Text>
              <Text variant="caption" color={Colors.inkSoft}>
                {[member.roleOnTeam, member.phone].filter(Boolean).join(' · ') || 'No details'}
              </Text>
            </View>
            <Pressable onPress={() => handleEdit(member)} hitSlop={8}>
              <Text variant="caption" color={Colors.sky}>
                Edit
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleRemove(member.id)}
              disabled={removeMember.isPending}
              hitSlop={8}
            >
              <Text variant="caption" color={Colors.brick}>
                Remove
              </Text>
            </Pressable>
          </Card>
        ))
      )}
    </DemoScreen>
  );
}

const styles = StyleSheet.create({
  formCard: {
    gap: Spacing.sm,
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  memberText: {
    flex: 1,
    gap: Spacing.xs,
  },
});
