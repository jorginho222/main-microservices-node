import * as express from 'express';
import {Request, Response} from "express";
import * as cors from 'cors';
import {createConnection} from "typeorm";
import * as amqp from 'amqplib/callback_api'
import {Product} from "./entity/Product";
import axios from "axios";
import {ObjectId} from "mongodb";

createConnection().then(db => {
    const productRepository = db.getMongoRepository(Product);
    amqp.connect('amqps://yjawjfrr:M_RnjO_jbU2Hy6SpN-S9Z-SofaIY2lMV@cow.rmq2.cloudamqp.com/yjawjfrr', function (error0, connection) {
        if (error0) {
            throw error0
        }

        connection.createChannel((error1, channel) => {
            if (error1) {
                throw error1
            }
            channel.assertQueue('product_created', {durable: false})
            channel.assertQueue('product_updated', {durable: false})
            channel.assertQueue('product_deleted', {durable: false})

            const app = express();

            app.use(cors({
                origin: ['http://localhost:4200', 'http://localhost:3000', "http://localhost:8080"]
            }));
            app.use(express.json());

            app.get('/api/products', async (req: Request, res: Response) => {
                const products = await productRepository.find()
                res.json(products)
            })
            app.post('/api/products/:id/like', async (req: Request, res: Response) => {
                const product = await productRepository.findOne({
                    where: {
                        _id: new ObjectId(req.params.id)
                    }
                })
                await axios.post(`http://localhost:8000/api/products/${product.admin_id}/like`, {})
                product.likes ++
                await productRepository.save(product)
                res.send(product)
            })

            channel.consume('product_created', async msg => {
                // product emitted from admin
                const eventProduct: Product = JSON.parse(msg.content.toString())
                const product = new Product()
                product.admin_id = parseInt(eventProduct.id)
                product.title = eventProduct.title
                product.image = eventProduct.image
                product.likes = eventProduct.likes

                await productRepository.save(product)
                console.log('product created')
            }, {noAck: true})
            channel.consume('product_updated', async msg => {
                // product emitted from admin
                const eventProduct: Product = JSON.parse(msg.content.toString())
                const product = await productRepository.findOne({
                    where: {
                        admin_id: parseInt(eventProduct.id)
                    }
                })
                productRepository.merge(product, {
                    title: eventProduct.title,
                    image: eventProduct.image,
                    likes: eventProduct.likes
                })

                await productRepository.save(product)
                console.log('product updated')
            }, {noAck: true})
            channel.consume('product_deleted', async msg => {
                // product emitted from admin
                const eventProductId: string = JSON.parse(msg.content.toString())
                await productRepository.deleteOne({admin_id: parseInt(eventProductId)})
                console.log('product deleted')
            })

            app.listen(8001, () => console.log('Listening on port 8001'));
            process.on('beforeExit', () => {
                console.log('Connection closed')
                connection.close()
            })
        })
    })
})