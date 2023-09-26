const express = require('express');
require('dotenv').config()
const app = express();
const axios = require('axios');
const http = require('http');
const server = http.createServer(app);
var bodyParser = require('body-parser')
var jsonParser = bodyParser.json()
var urlencodedParser = bodyParser.urlencoded({ extended: false })
const fetch = (...args) =>
	import('node-fetch').then(({default: fetch}) => fetch(...args));
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  }),
);  

const accountType = "demo"

const credentials = {
    name:       process.env.NAME,
    password:   process.env.PASSWORD,
    appId:      "Sample App",
    appVersion: "1.0",
    cid:        process.env.CID,
    sec:        process.env.SEC,
    deviceId:   process.env.DEVICEID
}
const getauthed = async () => {
    const response = await axios.post(`https://${accountType}.tradovateapi.com/auth/accessTokenRequest`, credentials, {
        headers: {
            'Content-Type': 'application/json'
        }
    })

    return response.data
}
const getSortedWorkingOrders = async () => {
    const {accessToken} = await getauthed()
    const orderList = await axios.get(`https://${accountType}.tradovateapi.com/v1/order/list`, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        }
    })
    const workingOrders = orderList.data.filter(order => order.ordStatus == "Working")
    const sortedWorkingOrders = workingOrders.sort((a,b) => {
        first = new Date(a.timestamp)
        second = new Date(b.timestamp)
        return second - first
    })
    return {sortedWorkingOrders, accessToken}
}
app.get('/getAuthed', urlencodedParser, jsonParser, async function(req, res, next) {
    const response = await getauthed()
    res.send(response)
})

app.get('/order/working', urlencodedParser, jsonParser, async function(req, res, next) {
    const { sortedWorkingOrders } = await getSortedWorkingOrders()
    
    res.send(sortedWorkingOrders)
})

app.get('/order/cancelLast', urlencodedParser, jsonParser, async function(req, res, next) {
    const { sortedWorkingOrders, accessToken } = await getSortedWorkingOrders()

    console.log('toDelete: ',sortedWorkingOrders[0].id)
    const toDelete = {orderId: sortedWorkingOrders[0].id}

    await axios.post(`https://${accountType}.tradovateapi.com/v1/order/cancelorder`, toDelete, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        }
    })

    res.send("deleted")
})

app.get('/order/flatten', urlencodedParser, jsonParser, async function(req, res, next) {
    const { sortedWorkingOrders, accessToken } = await getSortedWorkingOrders()

    const deleteOrder = async (id) => {
        await axios.post(`https://${accountType}.tradovateapi.com/v1/order/cancelorder`, id, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            }
        })
    }
    console.log(sortedWorkingOrders)
    sortedWorkingOrders.forEach(order => deleteOrder({orderId: order.id}))

    res.send("deleted all orders")
})

app.get('/order/list', urlencodedParser, jsonParser, async function(req, res, next) {
    const {accessToken} = await getauthed()

    const response = await axios.get(`https://${accountType}.tradovateapi.com/v1/order/list`, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        }
    })

    res.send(response.data)
})

app.post("/order/placeoso", urlencodedParser, jsonParser, async function(req, res, next) {
    if (req.body.name === "Close Last Order") {
        res.redirect('/order/cancelLast')
    } else if (req.body.name === "flatten") {
        res.redirect('/order/flatten')
    } else {
        
    const {accessToken} = await getauthed()

    // retireve account balance and make sure the order is the correct size
    const balanceInfo = await axios.post(`https://${accountType}.tradovateapi.com/v1/cashBalance/getcashbalancesnapshot`, {"accountId": 3128704}, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        }
    })
    const order = req.body
    // const maxOrderQty = 5
    const accountvalue = balanceInfo.data.totalCashValue
    const initialMargin = balanceInfo.data.initialMargin
    // const maxLossPerOrder = accountvalue * .01
    // const minProfit = 4     // 4 ticks is the minimum profit to take an order
    const potentialLoss = Math.abs(order.stopLossPrice - order.price)*4*12.5  
    const potentialProfit = Math.abs(order.takeProfitPrice - order.price)*4*12.5

    // set expiration after x amount of candles
    const howManySecondsToExp = parseInt(req.body.expireIn)
    // const expTime = new Date;
    // expTime.setSeconds(expTime.getSeconds() + howManySecondsToExp)
    // expTime.setSeconds(expTime.getSeconds() + howManySecondsToExp*2)

    console.log('-------------------------------------------------')
    console.log('the order is: ', order)
    console.log('order qty is : ', order.orderQty)
    // console.log('max order qty is : ', maxOrderQty)
    console.log('initial Margin is: ', initialMargin)
    console.log('expireIn seconds: ', req.body.expireIn)
    // console.log('the expiration time is: ', expTime)
    console.log('potential loss $', potentialLoss) 
    console.log('potential loss % of Account: ', potentialLoss/accountvalue*100) 
    console.log('potential profit $', potentialProfit) 
    // console.log('the max allowable loss per order is: $', maxLossPerOrder)
    console.log('-------------------------------------------------')
    
    // if (potentialLoss > maxLossPerOrder) {
    //     res.send('too large of loss')
    // } else if (Math.abs(order.takeProfitPrice - order.price)*4 < minProfit) {
    //     res.send('too small an order')
    // } else {
    
    const orderOBJ = {
        accountSpec: accountType === 'demo' ? process.env.DEMOSPEC : process.env.LIVESPEC,
        accountId: accountType === 'demo' ? parseInt(process.env.DEMOID) : process.env.LIVEID,
        action: order.action,
        symbol: order.symbol,
        // orderQty: order.orderQty > maxOrderQty ? maxOrderQty : order.orderQty,
        orderQty: order.orderQty,
        orderType: order.orderType,
        // expireTime: expTime,
        price: order.orderType === "Stop" || order.orderType === "Market" ? null : order.price,
        stopPrice: order.orderType === "Stop" ? order.price : null,
        isAutomated: true, 
        timeInForce: "GTC",
        bracket1: {
            action: order.action === "Buy" ? "Sell": "Buy",
            orderType: 'Limit',
            price: order.takeProfitPrice,
            timeInForce: "GTC",
            // expireTime: expTime,
        },
        bracket2: {
            action: order.action === "Buy" ? "Sell": "Buy",
            orderType: 'Stop',
            stopPrice: order.stopLossPrice,
            timeInForce: "GTC",
            // expireTime: expTime,
        }
    }

    const response = await axios.post(`https://${accountType}.tradovateapi.com/v1/order/placeoso`, orderOBJ, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        }
    })

    res.send(response.data)
}});

server.listen(80, () => {
  console.log('Server is listening on localhost:80');
});