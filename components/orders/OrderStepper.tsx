import React from 'react';
import { View } from 'react-native';
import { Text } from '@/lib/rnText';
import Feather from '@expo/vector-icons/Feather';
import { useTheme } from '@/context/ThemeContext';
import { type as typography } from '@/lib/theme';

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
  const { theme, isDark } = useTheme();

  if (status === 'canceled' || status === 'refunded' || status === 'failed') {
    return (
      <View
        style={{
          backgroundColor: isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEF2F2',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(239, 68, 68, 0.25)' : '#FECACA',
          padding: 14,
          marginBottom: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Feather name="x-circle" size={20} color="#EF4444" style={{ marginRight: 8 }} />
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: '#EF4444',
              fontFamily: typography.family.sansBold,
            }}
          >
            {status === 'refunded' ? 'Order Refunded' : status === 'failed' ? 'Order Failed' : 'Order Canceled'}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 12.5,
            color: isDark ? '#FCA5A5' : '#991B1B',
            fontFamily: typography.family.sans,
            lineHeight: 17,
          }}
        >
          {cancelReason
            ? `Reason: ${cancelReason}`
            : status === 'failed'
            ? 'Payment could not be processed for this order.'
            : 'This transaction was cancelled and the listing is now available.'}
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

  let placedSubtitle = 'Paid';
  if (paymentMethod === 'cod') {
    placedSubtitle = 'CoD Order';
  } else if (status === 'pending') {
    placedSubtitle = 'Pending';
  } else if (status === 'refund_due') {
    placedSubtitle = 'Refund due';
  } else if (status === 'failed') {
    placedSubtitle = 'Failed';
  }

  const steps = [
    { title: 'Placed', subtitle: placedSubtitle },
    { title: 'Packing', subtitle: 'Seller preparing' },
    { title: 'Shipped', subtitle: courierName || 'In transit' },
    { title: 'Completed', subtitle: 'Delivered' },
  ];

  return (
    <View
      style={{
        backgroundColor: theme.white,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.border,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {steps.map((step, index) => {
          const stepNum = index + 1;
          const isDone = stepNum < currentStage;
          const isCurrent = stepNum === currentStage;
          const isUpcoming = stepNum > currentStage;

          return (
            <React.Fragment key={step.title}>
              {/* Step Circle + Labels */}
              <View style={{ alignItems: 'center', width: 68 }}>
                <View
                  style={[
                    {
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 6,
                    },
                    isDone && { backgroundColor: '#10B981' },
                    isCurrent && {
                      backgroundColor: theme.purpleSoft,
                      borderWidth: 2,
                      borderColor: theme.purple,
                    },
                    isUpcoming && { backgroundColor: theme.panel },
                  ]}
                >
                  {isDone ? (
                    <Feather name="check" size={12} color="#FFFFFF" />
                  ) : isCurrent ? (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        backgroundColor: theme.purple,
                      }}
                    />
                  ) : (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: theme.muteSoft,
                        fontFamily: typography.family.sansSemibold,
                      }}
                    >
                      {stepNum}
                    </Text>
                  )}
                </View>

                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: isCurrent ? '800' : '600',
                    color: isCurrent ? theme.ink : theme.mute,
                    fontFamily: isCurrent ? typography.family.sansBold : typography.family.sansSemibold,
                    textAlign: 'center',
                  }}
                >
                  {step.title}
                </Text>
                <Text
                  style={{
                    fontSize: 10.5,
                    color: theme.muteSoft,
                    fontFamily: typography.family.sans,
                    textAlign: 'center',
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {step.subtitle}
                </Text>
              </View>

              {/* Connecting Line between steps */}
              {index < steps.length - 1 && (
                <View
                  style={{
                    flex: 1,
                    height: 2,
                    backgroundColor: stepNum < currentStage ? '#10B981' : theme.border,
                    marginTop: 12,
                    marginHorizontal: -4,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* Tracking info badge if shipped */}
      {trackingNumber ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'center',
            backgroundColor: theme.purpleSoft,
            borderRadius: 20,
            paddingHorizontal: 12,
            paddingVertical: 6,
            marginTop: 14,
          }}
        >
          <Feather name="truck" size={14} color={theme.purple} style={{ marginRight: 6 }} />
          <Text
            style={{
              fontSize: 12,
              color: theme.purple,
              fontFamily: typography.family.sansMedium,
            }}
          >
            {courierName ? `${courierName}: ` : ''}
            <Text style={{ fontWeight: '700' }}>{trackingNumber}</Text>
          </Text>
        </View>
      ) : null}
    </View>
  );
}
