import React, { useState } from 'react';
import {
  View,
  Pressable,
  Platform,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { BottomSheetModal } from '@/components/ui/BottomSheetModal';
import { ThumbButton } from '@/components/ui/ThumbButton';
import { Text } from '@/lib/rnText';
import { colors, radii, type } from '@/lib/theme';
import { buyerProtectionFee, orderTotal, formatPrice } from '@/lib/fees';

export type FulfillmentMethod = 'delivery' | 'handshake';
export type PaymentMethodType = 'card' | 'cod';

export interface CheckoutProduct {
  id: string;
  title: string;
  price: number;
  imageUrl?: string;
  sellerName?: string;
  shippingFee?: number;
  buyerProtectionFee?: number;
}

export interface CheckoutSheetProps {
  visible: boolean;
  onClose: () => void;
  product: CheckoutProduct;
  onConfirmPay: (details: {
    fulfillment: FulfillmentMethod;
    paymentMethod: PaymentMethodType;
    totalAmount: number;
  }) => void;
  loading?: boolean;
}

/**
 * Mobile-First 1-Step Checkout Bottom Sheet.
 * Eliminates multi-page cart/checkout routing by collapsing order summary,
 * fulfillment toggle, payment selection, and conversion into a single gesture modal.
 */
export function CheckoutSheet({
  visible,
  onClose,
  product,
  onConfirmPay,
  loading = false,
}: CheckoutSheetProps) {
  const [fulfillment, setFulfillment] = useState<FulfillmentMethod>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('cod');

  const itemPrice = product?.price || 0;
  const shippingFee = fulfillment === 'delivery' ? (product?.shippingFee ?? 0) : 0;
  const protectionFee =
    product?.buyerProtectionFee ?? buyerProtectionFee(itemPrice);
  const totalAmount = orderTotal(itemPrice) + shippingFee;

  const handleFulfillmentChange = (method: FulfillmentMethod) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setFulfillment(method);
  };

  const handlePaymentChange = (method: PaymentMethodType) => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setPaymentMethod(method);
  };

  const handlePayPress = () => {
    onConfirmPay({
      fulfillment,
      paymentMethod,
      totalAmount,
    });
  };

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="Instant Checkout"
      subtitle="Protected by Carrinex Buyer Guarantee"
      snapHeightRatio={0.9}
      scrollable
      footer={
        <View style={styles.footerInner}>
          <ThumbButton
            label={`Pay ${formatPrice(totalAmount)}`}
            variant="primary"
            size="hero"
            loading={loading}
            icon="lock"
            onPress={handlePayPress}
            accessibilityLabel={`Confirm and pay ${formatPrice(totalAmount)}`}
          />
        </View>
      }
    >
      <View style={styles.content}>
        {/* 1. Compact Product Summary (Mini-Image + Title + Price) */}
        <View style={styles.productCard}>
          {product?.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              contentFit="cover"
              style={styles.productThumb}
            />
          ) : (
            <View
              style={[
                styles.productThumb,
                {
                  backgroundColor: colors.panel,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
              ]}
            >
              <Feather name="image" size={24} color={colors.mute} />
            </View>
          )}
          <View style={styles.productDetails}>
            <Text
              style={[styles.productTitle, { fontFamily: type.family.sansBold }]}
              numberOfLines={2}
            >
              {product?.title}
            </Text>
            {product?.sellerName && (
              <Text style={styles.sellerName} numberOfLines={1}>
                Sold by @{product.sellerName}
              </Text>
            )}
            <Text style={[styles.itemPrice, { fontFamily: type.family.sansBold }]}>
              {formatPrice(itemPrice)}
            </Text>
          </View>
        </View>

        {/* 2. Fulfillment Method Toggle (Local Handshake vs Insured Delivery) */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontFamily: type.family.sansBold }]}>
            Fulfillment
          </Text>
          <View style={styles.fulfillmentGrid}>
            <Pressable
              onPress={() => handleFulfillmentChange('delivery')}
              style={[
                styles.fulfillmentCard,
                fulfillment === 'delivery' && styles.fulfillmentCardActive,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: fulfillment === 'delivery' }}
            >
              <View style={styles.fulfillmentHeader}>
                <Feather
                  name="truck"
                  size={18}
                  color={fulfillment === 'delivery' ? colors.primary : colors.ink}
                />
                <Text
                  style={[
                    styles.fulfillmentPrice,
                    {
                      color:
                        fulfillment === 'delivery'
                          ? colors.primary
                          : colors.mute,
                      fontFamily: type.family.sansBold,
                    },
                  ]}
                >
                  {formatPrice(product?.shippingFee ?? 4.99)}
                </Text>
              </View>
              <Text
                style={[
                  styles.fulfillmentLabel,
                  { fontFamily: type.family.sansBold },
                ]}
              >
                Insured Delivery
              </Text>
              <Text style={styles.fulfillmentHint}>2-4 business days</Text>
            </Pressable>

            <Pressable
              onPress={() => handleFulfillmentChange('handshake')}
              style={[
                styles.fulfillmentCard,
                fulfillment === 'handshake' && styles.fulfillmentCardActive,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: fulfillment === 'handshake' }}
            >
              <View style={styles.fulfillmentHeader}>
                <Feather
                  name="map-pin"
                  size={18}
                  color={fulfillment === 'handshake' ? colors.primary : colors.ink}
                />
                <Text
                  style={[
                    styles.fulfillmentPrice,
                    {
                      color:
                        fulfillment === 'handshake'
                          ? colors.primary
                          : colors.mute,
                      fontFamily: type.family.sansBold,
                    },
                  ]}
                >
                  Free
                </Text>
              </View>
              <Text
                style={[
                  styles.fulfillmentLabel,
                  { fontFamily: type.family.sansBold },
                ]}
              >
                Local Handshake
              </Text>
              <Text style={styles.fulfillmentHint}>Meet in public place</Text>
            </Pressable>
          </View>
        </View>

        {/* 3. Payment Method Selection */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { fontFamily: type.family.sansBold }]}>
            Payment Method
          </Text>
          <View style={styles.paymentList}>
            <PaymentRow
              title="Cash on Delivery (CoD)"
              subtitle="Pay with cash when package arrives"
              icon="truck"
              selected={paymentMethod === 'cod'}
              onSelect={() => handlePaymentChange('cod')}
            />
            <PaymentRow
              title="Debit / Credit Card"
              subtitle="Visa, Mastercard via Stripe"
              icon="credit-card"
              selected={paymentMethod === 'card'}
              onSelect={() => handlePaymentChange('card')}
            />
          </View>
        </View>

        {/* 4. Complete Price Breakdown */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Item price</Text>
            <Text style={styles.summaryValue}>{formatPrice(itemPrice)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.labelWithIcon}>
              <Text style={styles.summaryLabel}>Buyer protection</Text>
              <Feather name="shield" size={12} color={colors.primary} />
            </View>
            <Text style={styles.summaryValue}>{formatPrice(protectionFee)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Shipping</Text>
            <Text style={styles.summaryValue}>
              {shippingFee === 0 ? 'Free' : formatPrice(shippingFee)}
            </Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={[styles.totalLabel, { fontFamily: type.family.sansBold }]}>
              Total
            </Text>
            <Text style={[styles.totalValue, { fontFamily: type.family.sansBold }]}>
              {formatPrice(totalAmount)}
            </Text>
          </View>
        </View>
      </View>
    </BottomSheetModal>
  );
}

function PaymentRow({
  title,
  subtitle,
  icon,
  selected,
  onSelect,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      style={[styles.paymentRow, selected && styles.paymentRowActive]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
    >
      <View style={styles.paymentLeft}>
        <View
          style={[
            styles.paymentIconBox,
            selected && { backgroundColor: colors.primarySoft },
          ]}
        >
          <Feather
            name={icon}
            size={18}
            color={selected ? colors.primary : colors.ink}
          />
        </View>
        <View style={styles.paymentText}>
          <Text
            style={[
              styles.paymentTitle,
              { fontFamily: selected ? type.family.sansBold : type.family.sansMedium },
            ]}
          >
            {title}
          </Text>
          <Text style={styles.paymentSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <View
        style={[
          styles.radioCircle,
          selected && { borderColor: colors.primary, backgroundColor: colors.primary },
        ]}
      >
        {selected && <View style={styles.radioInner} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 20,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: colors.panel,
    borderRadius: radii['2xl'],
    gap: 14,
  },
  productThumb: {
    width: 64,
    height: 64,
    borderRadius: radii.xl,
    backgroundColor: colors.hairline,
  },
  productDetails: {
    flex: 1,
    gap: 2,
  },
  productTitle: {
    fontSize: 14,
    color: colors.ink,
    lineHeight: 18,
  },
  sellerName: {
    fontSize: 12,
    color: colors.mute,
  },
  itemPrice: {
    fontSize: 15,
    color: colors.ink,
    marginTop: 2,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 14,
    color: colors.ink,
    letterSpacing: 0.1,
  },
  fulfillmentGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  fulfillmentCard: {
    flex: 1,
    padding: 14,
    borderRadius: radii['2xl'],
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.white,
    gap: 4,
  },
  fulfillmentCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  fulfillmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  fulfillmentPrice: {
    fontSize: 13,
  },
  fulfillmentLabel: {
    fontSize: 13,
    color: colors.ink,
  },
  fulfillmentHint: {
    fontSize: 11,
    color: colors.mute,
  },
  paymentList: {
    gap: 8,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.white,
  },
  paymentRowActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(108, 71, 255, 0.04)',
  },
  paymentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentIconBox: {
    width: 38,
    height: 38,
    borderRadius: radii.md,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentText: {
    gap: 2,
  },
  paymentTitle: {
    fontSize: 13,
    color: colors.ink,
  },
  paymentSubtitle: {
    fontSize: 11,
    color: colors.mute,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
  summaryCard: {
    padding: 14,
    backgroundColor: colors.panel,
    borderRadius: radii['2xl'],
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  summaryLabel: {
    fontSize: 13,
    color: colors.mute,
  },
  summaryValue: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '500',
  },
  totalRow: {
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 15,
    color: colors.ink,
  },
  totalValue: {
    fontSize: 18,
    color: colors.primary,
  },
  footerInner: {
    width: '100%',
    paddingBottom: 4,
  },
});
