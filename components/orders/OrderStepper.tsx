import React from 'react';
import { View, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';

const TEAL = '#007782';

export interface OrderStepperProps {
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'completed' | 'canceled' | 'refunded' | 'refund_due' | 'failed' | string;
  paymentMethod?: string;
  shippedAt?: string | null;
  courierName?: string | null;
  trackingNumber?: string | null;
  cancelReason?: string | null;
  isSeller?: boolean;
}

export function OrderStepper({
  status,
  paymentMethod,
  shippedAt,
  courierName,
  trackingNumber,
  cancelReason,
  isSeller = false,
}: OrderStepperProps) {
  if (status === 'canceled' || status === 'refunded') {
    return (
      <View style={styles.canceledCard}>
        <View style={styles.canceledHeader}>
          <Feather name="x-circle" size={20} color="#DC2626" style={{ marginRight: 8 }} />
          <Text style={styles.canceledTitle}>
            {status === 'refunded' ? 'Order Refunded' : 'Order Canceled'}
          </Text>
        </View>
        <Text style={styles.canceledSubtitle}>
          {cancelReason ? `Reason: ${cancelReason}` : 'This transaction was cancelled and the listing is now available.'}
        </Text>
      </View>
    );
  }

  // Derive active stage (1 to 4)
  // Stage 1: Placed
  // Stage 2: Preparing / Packing
  // Stage 3: Shipped
  // Stage 4: Completed
  let currentStage = 1;
  if (status === 'completed' || status === 'delivered') {
    currentStage = 4; // Completed / Delivered
  } else if (shippedAt || status === 'shipped' || status === 'in_transit') {
    currentStage = 3; // Shipped / In transit
  } else if (status === 'paid') {
    currentStage = 2; // Paid & Seller Preparing
  }

  const steps = [
    { title: 'Placed', subtitle: paymentMethod === 'cod' ? 'CoD Order' : 'Paid' },
    { title: 'Packing', subtitle: 'Seller preparing' },
    { title: 'Shipped', subtitle: courierName || 'In transit' },
    { title: 'Completed', subtitle: 'Delivered' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.stepsRow}>
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isDone = stepNum < currentStage;
          const isCurrent = stepNum === currentStage;
          const isUpcoming = stepNum > currentStage;

          return (
            <React.Fragment key={step.title}>
              {/* Step Circle + Labels */}
              <View style={styles.stepColumn}>
                <View
                  style={[
                    styles.circle,
                    isDone && styles.circleDone,
                    isCurrent && styles.circleCurrent,
                    isUpcoming && styles.circleUpcoming,
                  ]}
                >
                  {isDone ? (
                    <Feather name="check" size={12} color="#FFFFFF" />
                  ) : isCurrent ? (
                    <View style={styles.activeDot} />
                  ) : (
                    <Text style={styles.stepNumText}>{stepNum}</Text>
                  )}
                </View>

                <Text style={[styles.stepTitle, isCurrent && styles.stepTitleCurrent]}>
                  {step.title}
                </Text>
                <Text style={styles.stepSubtitle} numberOfLines={1}>
                  {step.subtitle}
                </Text>
              </View>

              {/* Connecting Line between steps */}
              {index < steps.length - 1 && (
                <View
                  style={[
                    styles.connectorLine,
                    stepNum < currentStage && styles.connectorLineDone,
                  ]}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* Tracking info badge if shipped */}
      {trackingNumber ? (
        <View style={styles.trackingBadge}>
          <Feather name="truck" size={14} color={TEAL} style={{ marginRight: 6 }} />
          <Text style={styles.trackingText}>
            {courierName ? `${courierName}: ` : ''}
            <Text style={{ fontWeight: '700' }}>{trackingNumber}</Text>
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 16,
  } as ViewStyle,
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  } as ViewStyle,
  stepColumn: {
    alignItems: 'center',
    width: 68,
  } as ViewStyle,
  circle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  } as ViewStyle,
  circleDone: {
    backgroundColor: '#059669',
  } as ViewStyle,
  circleCurrent: {
    backgroundColor: '#E6F5F6',
    borderWidth: 2,
    borderColor: TEAL,
  } as ViewStyle,
  circleUpcoming: {
    backgroundColor: '#F3F4F6',
  } as ViewStyle,
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TEAL,
  } as ViewStyle,
  stepNumText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    fontFamily: 'Inter_600SemiBold',
  } as TextStyle,
  connectorLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#E5E7EB',
    marginTop: 12,
    marginHorizontal: -4,
  } as ViewStyle,
  connectorLineDone: {
    backgroundColor: '#059669',
  } as ViewStyle,
  stepTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'center',
  } as TextStyle,
  stepTitleCurrent: {
    fontWeight: '800',
    color: '#111111',
    fontFamily: 'Inter_700Bold',
  } as TextStyle,
  stepSubtitle: {
    fontSize: 10.5,
    color: '#9CA3AF',
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 2,
  } as TextStyle,
  canceledCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 14,
    marginBottom: 16,
  } as ViewStyle,
  canceledHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  } as ViewStyle,
  canceledTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
    fontFamily: 'Inter_700Bold',
  } as TextStyle,
  canceledSubtitle: {
    fontSize: 12.5,
    color: '#991B1B',
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
  } as TextStyle,
  trackingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#E6F5F6',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 14,
  } as ViewStyle,
  trackingText: {
    fontSize: 12,
    color: TEAL,
    fontFamily: 'Inter_500Medium',
  } as TextStyle,
});
