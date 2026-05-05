import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ticker = searchParams.get('ticker');
  const quarter = searchParams.get('quarter');

  if (!ticker || !quarter) {
    return NextResponse.json({ error: 'ticker and quarter required' }, { status: 400 });
  }

  const { data } = await supabase
    .from('config')
    .select('default_url')
    .eq('ticker', ticker)
    .eq('quarter', quarter)
    .single();

  return NextResponse.json({ defaultUrl: data?.default_url ?? null });
}
