import { getUncachableStripeClient } from '../server/stripeClient';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  console.log('Checking for existing DEXrp Premium product...');
  const existingProducts = await stripe.products.search({ 
    query: "name:'DEXrp Premium'" 
  });

  if (existingProducts.data.length > 0) {
    console.log('DEXrp Premium product already exists:', existingProducts.data[0].id);
    
    const prices = await stripe.prices.list({
      product: existingProducts.data[0].id,
      active: true,
    });
    
    console.log('Existing prices:');
    prices.data.forEach(price => {
      const interval = price.recurring?.interval || 'one-time';
      console.log(`  - ${price.id}: $${(price.unit_amount || 0) / 100}/${interval}`);
    });
    
    return;
  }

  console.log('Creating DEXrp Premium product...');
  const product = await stripe.products.create({
    name: 'DEXrp Premium',
    description: 'Unlimited wallets, optional encrypted cloud sync, priority support for XRPL DEX trading',
    metadata: {
      tier: 'premium',
      features: 'unlimited_wallets,cloud_sync,priority_support',
    },
  });
  console.log('Created product:', product.id);

  console.log('Creating monthly price ($3.49/month)...');
  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 349,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: {
      plan_type: 'monthly',
    },
  });
  console.log('Created monthly price:', monthlyPrice.id);

  console.log('Creating yearly price ($29.99/year)...');
  const yearlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 2999,
    currency: 'usd',
    recurring: { interval: 'year' },
    metadata: {
      plan_type: 'yearly',
      savings: '15%',
    },
  });
  console.log('Created yearly price:', yearlyPrice.id);

  console.log('\n=== IMPORTANT ===');
  console.log('Add these price IDs to your environment variables:');
  console.log(`STRIPE_MONTHLY_PRICE_ID=${monthlyPrice.id}`);
  console.log(`STRIPE_YEARLY_PRICE_ID=${yearlyPrice.id}`);
}

createProducts()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
