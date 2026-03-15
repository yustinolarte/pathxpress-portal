const input = {
    "0": {
        token: "test_token",
        originCountry: "United Arab Emirates",
        destinationCountry: "United States",
        realWeightKg: 1.5,
        dimensionsCm: { length: 10, width: 10, height: 10 }
    }
};

const qs = encodeURIComponent(JSON.stringify(input));
const url = `http://localhost:3000/api/trpc/portal.internationalRates.quote?batch=1&input=${qs}`;

fetch(url)
    .then(res => res.json())
    .then(data => {
        console.log(JSON.stringify(data[0].result.data, null, 2));
    }).catch(console.error);
