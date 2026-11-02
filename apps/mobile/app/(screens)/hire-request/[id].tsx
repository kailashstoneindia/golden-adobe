import { Role, type ArtisanHireRequestDto } from '@golden-abode/types';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { DemoScreen } from '../../../src/components/demo/DemoScreen';
import { OrderListRow } from '../../../src/components/orders';
import { Badge, Button, Card, EmptyStateCard, Text, TextInput } from '../../../src/components/ui';
import {
  EMPTY_STATE_MESSAGES,
  ERROR_MESSAGES,
  HIRE_REQUEST_STATUS_LABELS,
  ROUTES,
  TOAST_MESSAGES,
} from '../../../src/constants';
import {
  useAddEstimateMutation,
  useCancelHireRequestMutation,
  useCompleteHireRequestMutation,
  useHireRequestEstimatesQuery,
  useHireRequestOrdersQuery,
  useHireRequestQuery,
  useStartHireRequestMutation,
} from '../../../src/hooks/artisans';
import { useAuth } from '../../../src/hooks/auth';
import { useToast } from '../../../src/hooks/useToast';
import { Colors, Spacing } from '../../../src/theme';
import {
  canCancelHireRequest,
  formatShortDate,
  getApiErrorMessage,
  isActiveArtisanJob,
  isBookingAttributable,
  navigateToOrderDetail,
  parseWholeNumber,
  shortId,
  toHireRequestBadgeVariant,
} from '../../../src/utils';

export default function HireRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const isArtisan = user?.role === Role.ARTISAN;
  const requestQuery = useHireRequestQuery(id ?? null);
  const request = requestQuery.data;

  if (requestQuery.isLoading) {
    return (
      <DemoScreen title="Hire request" showBack>
        <Text variant="body" color={Colors.inkSoft}>
          Loading…
        </Text>
      </DemoScreen>
    );
  }

  if (!request) {
    return (
      <DemoScreen title="Hire request" showBack>
        <EmptyStateCard title="Not available" message={ERROR_MESSAGES.hireRequestNotFound} />
      </DemoScreen>
    );
  }

  return <HireRequestDetail request={request} isArtisan={isArtisan} />;
}

function HireRequestDetail({
  request,
  isArtisan,
}: Readonly<{ request: ArtisanHireRequestDto; isArtisan: boolean }>) {
  const { showSuccess, showError } = useToast();
  const startWork = useStartHireRequestMutation();
  const completeWork = useCompleteHireRequestMutation();
  const cancelRequest = useCancelHireRequestMutation();
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const status = request.status;
  const isPendingReview = status === 'PENDING_ADMIN_REVIEW';
  const isBusy = startWork.isPending || completeWork.isPending || cancelRequest.isPending;

  const actionCallbacks = (successMessage: string) => ({
    onSuccess: () => showSuccess(successMessage),
    onError: (error: unknown) =>
      showError(getApiErrorMessage(error, ERROR_MESSAGES.hireRequestActionFailed)),
  });

  // Completing is final for the customer and cannot be undone, so ask first.
  const handleComplete = (): void => {
    Alert.alert(
      'Mark job as completed?',
      'The customer will see this job as finished. You cannot undo this.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Mark completed',
          onPress: () =>
            completeWork.mutate(request.id, actionCallbacks(TOAST_MESSAGES.jobCompleted)),
        },
      ],
    );
  };

  const handleConfirmCancel = (): void => {
    const reason = cancelReason.trim();
    if (!reason) {
      setCancelError(ERROR_MESSAGES.cancelReasonRequired);
      return;
    }
    setCancelError(null);
    cancelRequest.mutate(
      { requestId: request.id, reason },
      {
        onSuccess: () => {
          showSuccess(TOAST_MESSAGES.hireRequestCancelled);
          setIsCancelling(false);
          setCancelReason('');
        },
        onError: (error) =>
          showError(getApiErrorMessage(error, ERROR_MESSAGES.hireRequestActionFailed)),
      },
    );
  };

  return (
    <DemoScreen title={`Job ${shortId(request.id)}`} showBack>
      <Badge
        label={HIRE_REQUEST_STATUS_LABELS[status]}
        variant={toHireRequestBadgeVariant(status)}
      />

      <Card style={styles.card}>
        <Text variant="caption" color={Colors.inkSoft}>
          Site address
        </Text>
        <Text variant="body">{request.addressText}</Text>
        {request.notes ? (
          <>
            <Text variant="caption" color={Colors.inkSoft} style={styles.sectionGap}>
              Job notes
            </Text>
            <Text variant="body">{request.notes}</Text>
          </>
        ) : null}
        <Text variant="caption" color={Colors.inkSoft} style={styles.sectionGap}>
          {buildTimelineText(request)}
        </Text>
      </Card>

      {isPendingReview && !isArtisan ? (
        <Text variant="caption" color={Colors.inkSoft}>
          Our team is reviewing this request. The Ustaad is notified once it is approved.
        </Text>
      ) : null}
      {status === 'ADMIN_REJECTED' && request.adminRejectReason ? (
        <Card style={styles.card}>
          <Text variant="bodyMedium">Request not approved</Text>
          <Text variant="body" color={Colors.inkSoft}>
            {request.adminRejectReason}
          </Text>
        </Card>
      ) : null}
      {status === 'CANCELLED' && request.cancelReason ? (
        <Card style={styles.card}>
          <Text variant="bodyMedium">Cancelled</Text>
          <Text variant="body" color={Colors.inkSoft}>
            {request.cancelReason}
          </Text>
        </Card>
      ) : null}

      {isArtisan && status === 'ACCEPTED_BY_ARTISAN' ? (
        <Button
          title={startWork.isPending ? 'Starting…' : 'Start work'}
          fullWidth
          disabled={isBusy}
          onPress={() => startWork.mutate(request.id, actionCallbacks(TOAST_MESSAGES.jobStarted))}
        />
      ) : null}
      {isArtisan && status === 'IN_PROGRESS' ? (
        <Button
          title={completeWork.isPending ? 'Saving…' : 'Mark as completed'}
          fullWidth
          disabled={isBusy}
          onPress={handleComplete}
        />
      ) : null}

      {!isArtisan && isBookingAttributable(status) ? (
        <Card style={styles.card}>
          <Text variant="bodyMedium">Buying materials for this job?</Text>
          <Text variant="caption" color={Colors.inkSoft}>
            Choose Job {shortId(request.id)} at checkout to link your order to this Ustaad.
          </Text>
          <Button
            title="Browse materials"
            variant="secondary"
            onPress={() => router.push(ROUTES.tabs.browse)}
          />
        </Card>
      ) : null}

      <EstimatesSection request={request} isArtisan={isArtisan} />
      <AttributedOrdersSection request={request} />

      {canCancelHireRequest(status) ? (
        isCancelling ? (
          <Card style={styles.card}>
            <TextInput
              label="Reason for cancelling"
              placeholder="Plans changed"
              value={cancelReason}
              onChangeText={setCancelReason}
              error={cancelError ?? undefined}
              multiline
            />
            <View style={styles.row}>
              <Button
                title={cancelRequest.isPending ? 'Cancelling…' : 'Confirm cancel'}
                disabled={isBusy}
                onPress={handleConfirmCancel}
              />
              <Button title="Keep job" variant="ghost" onPress={() => setIsCancelling(false)} />
            </View>
          </Card>
        ) : (
          <Button
            title={isArtisan ? 'Cancel job' : 'Cancel request'}
            variant="secondary"
            fullWidth
            disabled={isBusy}
            onPress={() => setIsCancelling(true)}
          />
        )
      ) : null}
    </DemoScreen>
  );
}

function EstimatesSection({
  request,
  isArtisan,
}: Readonly<{ request: ArtisanHireRequestDto; isArtisan: boolean }>) {
  // An artisan gets a 403 on requests still awaiting admin review.
  const canView = !(isArtisan && request.status === 'PENDING_ADMIN_REVIEW');
  const estimatesQuery = useHireRequestEstimatesQuery(request.id, canView);
  const addEstimate = useAddEstimateMutation();
  const { showSuccess, showError } = useToast();
  const [days, setDays] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const canAddEstimate = isArtisan && isActiveArtisanJob(request.status);
  const estimates = estimatesQuery.data ?? [];

  const handleAdd = (): void => {
    const estimatedDays = parseWholeNumber(days);
    if (!estimatedDays || estimatedDays < 1) {
      setFormError(ERROR_MESSAGES.estimateDaysInvalid);
      return;
    }
    setFormError(null);
    addEstimate.mutate(
      { requestId: request.id, estimatedDays, note: note.trim() || undefined },
      {
        onSuccess: () => {
          showSuccess(TOAST_MESSAGES.estimateAdded);
          setDays('');
          setNote('');
        },
        onError: (error) => showError(getApiErrorMessage(error, ERROR_MESSAGES.estimateSaveFailed)),
      },
    );
  };

  if (!canView) {
    return null;
  }

  return (
    <>
      <Text variant="h3" style={styles.sectionTitle}>
        Completion estimates
      </Text>
      {estimates.length === 0 ? (
        <EmptyStateCard message={EMPTY_STATE_MESSAGES.estimatesEmpty} />
      ) : (
        [...estimates].reverse().map((estimate) => (
          <Card key={estimate.id} style={styles.card}>
            <Text variant="bodyMedium">
              {estimate.estimatedDays} day{estimate.estimatedDays === 1 ? '' : 's'}
            </Text>
            {estimate.note ? (
              <Text variant="body" color={Colors.inkSoft}>
                {estimate.note}
              </Text>
            ) : null}
            <Text variant="caption" color={Colors.inkSoft}>
              Added {formatShortDate(estimate.createdAt)}
            </Text>
          </Card>
        ))
      )}
      {canAddEstimate ? (
        <Card style={styles.card}>
          <Text variant="bodyMedium">Add an estimate</Text>
          <TextInput
            label="Days to complete"
            placeholder="3"
            value={days}
            onChangeText={(value) => setDays(value.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={3}
          />
          <TextInput
            label="Note (optional)"
            placeholder="Waiting on tiles delivery"
            value={note}
            onChangeText={setNote}
          />
          {formError ? (
            <Text variant="caption" color={Colors.brick}>
              {formError}
            </Text>
          ) : null}
          <Button
            title={addEstimate.isPending ? 'Saving…' : 'Add estimate'}
            variant="secondary"
            disabled={addEstimate.isPending}
            onPress={handleAdd}
          />
        </Card>
      ) : null}
    </>
  );
}

function AttributedOrdersSection({ request }: Readonly<{ request: ArtisanHireRequestDto }>) {
  const canHaveOrders = isBookingAttributable(request.status);
  const ordersQuery = useHireRequestOrdersQuery(request.id, canHaveOrders);
  const orders = ordersQuery.data ?? [];

  if (!canHaveOrders) {
    return null;
  }

  return (
    <>
      <Text variant="h3" style={styles.sectionTitle}>
        Material orders
      </Text>
      {orders.length === 0 ? (
        <EmptyStateCard message={EMPTY_STATE_MESSAGES.attributedOrdersEmpty} />
      ) : (
        orders.map((order) => (
          <OrderListRow key={order.id} order={order} onPress={navigateToOrderDetail} />
        ))
      )}
    </>
  );
}

function buildTimelineText(request: ArtisanHireRequestDto): string {
  const parts = [`Requested ${formatShortDate(request.createdAt)}`];
  if (request.startedAt) {
    parts.push(`started ${formatShortDate(request.startedAt)}`);
  }
  if (request.completedAt) {
    parts.push(`completed ${formatShortDate(request.completedAt)}`);
  }
  if (request.cancelledAt) {
    parts.push(`cancelled ${formatShortDate(request.cancelledAt)}`);
  }
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.sm,
  },
  sectionGap: {
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    marginTop: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
});
