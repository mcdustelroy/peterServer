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

let accountType 

const credentials = {
    name:       process.env.NAME,
    password:   process.env.PASSWORD,
    appId:      "Sample App",
    appVersion: "1.0",
    cid:        process.env.CID,
    sec:        process.env.SEC,
    deviceId:   process.env.DEVICEID
}
const getauthed = async (account) => {
    const response = await axios.post(`https://${account}.tradovateapi.com/auth/accessTokenRequest`, credentials, {
        headers: {
            'Content-Type': 'application/json'
        }
    })

    return response.data
}
const getSortedWorkingOrders = async (account) => {
    const {accessToken} = await getauthed(account)
    const orderList = await axios.get(`https://${account}.tradovateapi.com/v1/order/list`, {
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
    return {sortedWorkingOrders}
}


// Routes
app.get('/:account/order/flatten/:contractToFlatten', urlencodedParser, jsonParser, async function(req, res, next) {
    const {accessToken} = await getauthed(req.params.account)
    
    // FIRST: liqudate positions --------------------------------------------------------------------------------------------------------------------
        const contractResponse = await axios.get(`https://${req.params.account}.tradovateapi.com/v1/contract/find?name=${req.params.contractToFlatten}`, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                }
            })
        const contractID = contractResponse.data.id
        const LiquidatePosistions = async (contractID) => {
            await axios.post(`https://${req.params.account}.tradovateapi.com/v1/order/liquidateposition`, contractID, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                }
            })
        }
        // Liquidate all positions related to the contract ID (contract is something like MNQZ3, or ESZ3, but they all have unique Tradovate IDs)
        LiquidatePosistions(
            {
                "accountId": req.params.account === 'live' ? parseInt(process.env.LIVEID) : parseInt(process.env.DEMOID),
                "contractId": contractID,
                "admin": false
            }
        )  

    // SECOND: Delete pending/suspended orders --------------------------------------------------------------------------------------------------------------------
        const { sortedWorkingOrders } = await getSortedWorkingOrders(req.params.account)
        const deleteOrder = async (id) => {
            await axios.post(`https://${req.params.account}.tradovateapi.com/v1/order/cancelorder`, id, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                }
            })
        }
        console.log(sortedWorkingOrders[0])
        sortedWorkingOrders.forEach(order => {
            if (order.accountId === contractID) {
                deleteOrder({orderId: order.id})
            }
        })  

    res.send('Positions liqidated and orders cancelled (ie "flattened")')
})

app.get('/:account/order/list', urlencodedParser, jsonParser, async function(req, res, next) {
    const {accessToken} = await getauthed(req.params.account)

    const response = await axios.get(`https://${req.params.account}.tradovateapi.com/v1/order/list`, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        }
    })

    res.send(response.data)
})

app.post("/order/placeoso", urlencodedParser, jsonParser, async function(req, res, next) {
    const contractToFlatten = req.body.symbol
    try {
        if (req.body.name === "Close Last Order") {
            res.redirect('/order/cancelLast')
        } else if (req.body.name === "flatten") {
            res.redirect(`/${req.body.account}/order/flatten/${contractToFlatten}`)
        } else {
            
        let accountID 
        if (req.body.account === 'demo') {
            accountType = 'demo'
            accountID = parseInt(process.env.DEMOID)
        } else if (req.body.account === 'live') {
            accountType = 'live'
            accountID = parseInt(process.env.LIVEID)
        } else {
            console.log('Please supply an account type ("live" or "demo")')
            res.send('Please supply an account type ("live" or "demo")')
        }

        const {accessToken} = await getauthed(req.body.account)

        const balanceInfo = await axios.post(`https://${req.body.account}.tradovateapi.com/v1/cashBalance/getcashbalancesnapshot`, {"accountId": accountID}, {
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
        // const potentialLoss = Math.abs(order.stopLossPrice - order.price)*4*12.5  
        // const potentialProfit = Math.abs(order.takeProfitPrice - order.price)*4*12.5

        // set expiration after x amount of candles
        // const howManySecondsToExp = parseInt(req.body.expireIn)
        // const expTime = new Date;
        // expTime.setSeconds(expTime.getSeconds() + howManySecondsToExp)
        // expTime.setSeconds(expTime.getSeconds() + howManySecondsToExp*2)

        console.log('-------------------------------------------------')
        console.log('the order is: ', order)
        console.log('the accountID is: ', accountType === 'live' ? process.env.LIVEID : process.env.DEMOID)
        console.log('the account Value is: ', accountvalue)
        console.log('order qty is : ', order.orderQty)
        // console.log('max order qty is : ', maxOrderQty)
        console.log('initial Margin is: ', initialMargin)
        // console.log('expireIn seconds: ', req.body.expireIn)
        // console.log('the expiration time is: ', expTime)
        // console.log('potential loss $', potentialLoss) 
        // console.log('potential loss % of Account: ', potentialLoss/accountvalue*100) 
        // console.log('potential profit $', potentialProfit) 
        // console.log('the max allowable loss per order is: $', maxLossPerOrder)
        console.log('-------------------------------------------------')
        
        // if (potentialLoss > maxLossPerOrder) {
        //     res.send('too large of loss')
        // } else if (Math.abs(order.takeProfitPrice - order.price)*4 < minProfit) {
        //     res.send('too small an order')
        // } else {
        
        const orderOBJ = {
            accountSpec: accountType === 'live' ? process.env.LIVESPEC : process.env.DEMOSPEC,
            accountId: accountType === 'live' ? parseInt(process.env.LIVEID) : parseInt(process.env.DEMOID),
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

        const response = await axios.post(`https://${req.body.account}.tradovateapi.com/v1/order/placeoso`, orderOBJ, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            }
        })

        res.send(response.data)
    }                        
    } catch (error) {
        console.log("console logging error in placeoso")
        console.log(error.message)
        // res.send('error in plaseoso')
    }
});


// error handler
app.use((err, req, res, next) => {
    res.status(500).send('Something broke!')
    
    res.send({
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? err.stack : err.stack
    })
})

server.listen(80, () => {
  console.log('Server is listening on localhost:80');
});