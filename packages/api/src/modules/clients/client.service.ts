import type { ClientId } from '@hrms/shared';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Client } from './entities/client.entity';

type CreateClientInput = {
  readonly name: string;
};

@Injectable()
export class ClientService {
  constructor(@InjectRepository(Client) private readonly clients: Repository<Client>) {}

  create(input: CreateClientInput): Promise<Client> {
    return this.clients.save(this.clients.create({ name: input.name }));
  }

  getById(id: ClientId): Promise<Client | null> {
    return this.clients.findOne({ where: { id } });
  }

  list(): Promise<Client[]> {
    return this.clients.find({ order: { createdAt: 'DESC' } });
  }
}
