// Enumerations for Load Balancer Algorithm
export enum LbAlgorithm {
    RANDOM = 'rand',
    ROUND_ROBIN = 'rr',
    WEIGHTED_ROUND_ROBIN = 'wrr',
}

// Enumerations for Load Balancer Health Check
export enum BEServerHealth {
    UNHEALTHY = 'un_healthy',
    HEALTHY = 'healthy'
}
