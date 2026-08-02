import { describe, expect, it } from 'vitest';
import {
  addPaise,
  amountInWordsIndian,
  computeGst,
  positiveDiff,
  roundHalfUpToPaisa,
  roundInvoiceTotal,
  rupeesToPaise,
} from './money.js';

describe('money.ts', () => {
  it('converts rupees to paise without float drift', () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
    expect(rupeesToPaise('0.1')).toBe(10);
    expect(addPaise(rupeesToPaise('0.1'), rupeesToPaise('0.2'))).toBe(30); // classic float trap
  });

  it('computes positiveDiff (overage math) correctly', () => {
    expect(positiveDiff(120, 80)).toBe(40);
    expect(positiveDiff(60, 80)).toBe(0);
  });

  it('rounds half-up to the paisa', () => {
    expect(roundHalfUpToPaisa(10.005)).toBeCloseTo(10.01, 2);
    expect(roundHalfUpToPaisa(10.004)).toBeCloseTo(10.0, 2);
  });

  it('rounds invoice total to nearest rupee with an explicit adjustment', () => {
    const { roundedTotal, roundingAdjustment } = roundInvoiceTotal(1234.6);
    expect(roundedTotal).toBe(1235);
    expect(roundingAdjustment).toBeCloseTo(0.4, 2);
  });

  it('splits CGST+SGST for intra-state supply', () => {
    const gst = computeGst({
      taxableValue: 1000,
      gstRatePct: 12,
      supplierStateCode: '27',
      placeOfSupplyStateCode: '27',
    });
    expect(gst.taxType).toBe('CGST_SGST');
    expect(gst.cgstAmount).toBeCloseTo(60, 2);
    expect(gst.sgstAmount).toBeCloseTo(60, 2);
    expect(gst.igstAmount).toBe(0);
    expect(gst.totalTax).toBeCloseTo(120, 2);
  });

  it('applies IGST for inter-state supply', () => {
    const gst = computeGst({
      taxableValue: 1000,
      gstRatePct: 12,
      supplierStateCode: '27',
      placeOfSupplyStateCode: '29',
    });
    expect(gst.taxType).toBe('IGST');
    expect(gst.igstAmount).toBeCloseTo(120, 2);
    expect(gst.cgstAmount).toBe(0);
    expect(gst.sgstAmount).toBe(0);
  });

  it('renders amount in words using the Indian numbering system', () => {
    expect(amountInWordsIndian(0)).toBe('Rupees Zero Only');
    expect(amountInWordsIndian(1500)).toBe('Rupees One Thousand Five Hundred Only');
    expect(amountInWordsIndian(125000)).toBe('Rupees One Lakh Twenty Five Thousand Only');
    expect(amountInWordsIndian(10000000)).toBe('Rupees One Crore Only');
  });
});
